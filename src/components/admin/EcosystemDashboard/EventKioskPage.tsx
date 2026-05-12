// src/pages/Ecosystem/EventKioskPage/EventKioskPage.tsx

import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, onSnapshot, query, collection, where, orderBy, limit, getDoc } from 'firebase/firestore';
import { QRCodeSVG } from 'qrcode.react';
import { db } from '../../../lib/firebase';
import { Loader2, ArrowLeft, Printer, Clock, Lock } from 'lucide-react'; // 🚀 Added Clock and Lock
import moment from 'moment';
import type { EcosystemEvent } from '../../../types/ecosystem.types';

import mLogo from '../../../assets/logo/mlab_logo_white.png';
import mLogoDark from '../../../assets/logo/mlab_logo.png'; // Used for the white printout

const MIDNIGHT = '#073f4e';
const GREEN = '#94c73d';

// ─── SMART DATE FORMATTER ───
const formatEventDuration = (startIso: string, endIso?: string) => {
    if (!startIso) return "Date TBD";
    const start = new Date(startIso);
    const end = endIso ? new Date(endIso) : start;

    start.setHours(0, 0, 0, 0);
    end.setHours(0, 0, 0, 0);

    const diffDays = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    const startStr = start.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' });

    if (diffDays <= 1) return startStr;

    if (start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear()) {
        const monthYear = start.toLocaleDateString('en-ZA', { month: 'short', year: 'numeric' });
        return `${start.getDate()} – ${end.getDate()} ${monthYear} (${diffDays} Days)`;
    }

    const endStr = end.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' });
    return `${startStr} – ${endStr} (${diffDays} Days)`;
};

// ─── Animations & Print Styles ───────────────────────────────────────────────
const KioskStyles = () => (
    <style>
        {`
            @keyframes popBubble {
                0% { transform: scale(0.4); opacity: 0; }
                60% { transform: scale(1.15); opacity: 1; }
                80% { transform: scale(0.95); }
                100% { transform: scale(1); opacity: 1; }
            }
            @keyframes slideInRight {
                from { transform: translateX(20px); opacity: 0; }
                to { transform: translateX(0); opacity: 1; }
            }
            .hide-scroll::-webkit-scrollbar {
                display: none;
            }

            /* 🖨️ PRINT MEDIA STYLES - Formats a beautiful A4 poster 🖨️ */
            @media print {
                body, html {
                    background: white !important;
                    margin: 0 !important;
                    padding: 0 !important;
                }
                .no-print {
                    display: none !important;
                }
                .print-only {
                    display: flex !important;
                }
                .print-container {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    height: 100vh;
                    text-align: center;
                    color: black !important;
                }
                .print-qr-wrapper {
                    margin: 40px 0;
                }
            }
            
            /* Hide print-only elements on the screen */
            .print-only {
                display: none;
            }
        `}
    </style>
);

// ─── TIME PILL ───────────────────────────────────────────────────────────────
function TimePill({ label, time, color }: { label: string; time: string | number | undefined; color: string }) {
    if (!time) return null;
    const isRecent = Date.now() - new Date(time).getTime() < 15000;

    return (
        <div style={{
            fontSize: 10, fontWeight: 700, color: '#fff', backgroundColor: color,
            padding: '3px 6px', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, flex: 1,
            animation: isRecent ? 'popBubble 0.6s cubic-bezier(0.175, 0.885, 0.32, 1.275) both' : 'none',
            boxShadow: isRecent ? `0 0 12px ${color}80` : 'none',
            transition: 'box-shadow 1s ease-out',
            maxWidth: 'fit-content'
        }}>
            <span>{label}</span>
            <span style={{ opacity: 0.8, fontWeight: 500 }}>{moment(time).format('HH:mm')}</span>
        </div>
    );
}

export const EventKioskPage: React.FC = () => {
    const { eventId } = useParams<{ eventId: string }>();
    const navigate = useNavigate();

    const [event, setEvent] = useState<EcosystemEvent | null>(null);
    const [recentScans, setRecentScans] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    const checkInUrl = `https://mlab-guest-portal.firebaseapp.com/guest/${eventId}`;

    useEffect(() => {
        if (!eventId) return;

        const fetchInitialEvent = async () => {
            try {
                const docRef = doc(db, 'events', eventId);
                const snap = await getDoc(docRef);
                if (snap.exists()) {
                    setEvent({ id: snap.id, ...snap.data() } as EcosystemEvent);
                }
            } catch (err) {
                console.error("Failed to load event", err);
            } finally {
                setLoading(false);
            }
        };

        fetchInitialEvent();

        const unsubEvent = onSnapshot(doc(db, 'events', eventId), (snap) => {
            if (snap.exists()) {
                setEvent(prev => ({ ...prev, ...snap.data() } as EcosystemEvent));
            }
        });

        // ONLY SHOW TODAY'S CHECK-INS ON THE TV
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);

        const todayEnd = new Date();
        todayEnd.setHours(23, 59, 59, 999);

        const q = query(
            collection(db, 'event_checkins'),
            where('eventId', '==', eventId),
            where('timestamp', '>=', todayStart.toISOString()),
            where('timestamp', '<=', todayEnd.toISOString()),
            orderBy('timestamp', 'desc'),
            limit(12)
        );

        const unsubScans = onSnapshot(q, (snapshot) => {
            const scans = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
            setRecentScans(scans);
        });

        return () => {
            unsubEvent();
            unsubScans();
        };
    }, [eventId]);

    // Handle Printing
    const handlePrint = () => {
        window.print();
    };

    if (loading) {
        return (
            <div style={{ minHeight: '100vh', background: MIDNIGHT, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Loader2 className="lfm-spin" color={GREEN} size={48} />
            </div>
        );
    }

    if (!event) {
        return (
            <div style={{ minHeight: '100vh', background: MIDNIGHT, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'white' }}>
                <h1 style={{ fontFamily: 'system-ui' }}>Event Not Found</h1>
                <button
                    onClick={() => navigate('/admin')}
                    style={{ marginTop: 20, background: GREEN, color: MIDNIGHT, border: 'none', padding: '10px 20px', borderRadius: '8px', cursor: 'pointer', fontWeight: 600 }}
                >
                    Return to Dashboard
                </button>
            </div>
        );
    }

    // 🚀 TIME & DATE VALIDATION 🚀
    const now = new Date();
    const eventStart = new Date(event.date);
    eventStart.setHours(0, 0, 0, 0); // Start of the first day
    
    const endDateStr = (event as any).endDate || event.date;
    const eventEnd = new Date(endDateStr);
    eventEnd.setHours(23, 59, 59, 999); // End of the last day

    const isUpcoming = now.getTime() < eventStart.getTime();
    const isConcluded = now.getTime() > eventEnd.getTime();
    const isActive = !isUpcoming && !isConcluded;

    return (
        <>
            <KioskStyles />

            {/* 🖨️ THE PRINT-ONLY VIEW (Hidden on screen, shown on paper) 🖨️ */}
            {isActive && (
                <div className="print-only print-container">
                    <img src={mLogoDark} alt="mLab Logo" height={60} style={{ marginBottom: '20px' }} />
                    <div style={{ fontSize: '14px', fontWeight: 600, color: GREEN, letterSpacing: '0.15em', textTransform: 'uppercase' }}>
                        Welcome to mLab
                    </div>
                    <h1 style={{ fontSize: '48px', fontWeight: 800, margin: '10px 0', color: MIDNIGHT, fontFamily: 'system-ui' }}>
                        {event.eventName}
                    </h1>
                    <p style={{ fontSize: '18px', color: '#6b6b6b', margin: '0 0 20px 0', fontFamily: 'system-ui' }}>
                        {event.location.split(',')[0]} • {formatEventDuration(event.date, (event as any).endDate)}
                    </p>

                    <div className="print-qr-wrapper">
                        <QRCodeSVG value={checkInUrl} size={450} level="M" fgColor={MIDNIGHT} />
                    </div>

                    <h2 style={{ fontSize: '24px', fontWeight: 700, margin: '0', color: MIDNIGHT, fontFamily: 'system-ui' }}>
                        Scan to Check In
                    </h2>
                    <p style={{ fontSize: '16px', color: '#6b6b6b', marginTop: '10px', fontFamily: 'system-ui' }}>
                        Point your phone's camera at the QR code to register your attendance.
                    </p>
                </div>
            )}

            {/* 📺 THE TV / SCREEN VIEW (Hidden when printing) 📺 */}
            <div className="no-print" style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: '100vh', background: MIDNIGHT, position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, overflow: 'hidden' }}>

                {/* Decorative orbs */}
                <div style={{ position: 'absolute', top: -80, right: -80, width: 260, height: 260, borderRadius: '50%', background: GREEN, opacity: .06, pointerEvents: 'none' }} />
                <div style={{ position: 'absolute', bottom: -60, left: -60, width: 200, height: 200, borderRadius: '50%', background: GREEN, opacity: .04, pointerEvents: 'none' }} />

                {/* Header */}
                <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '18px 32px', borderBottom: '1px solid rgba(255,255,255,0.06)'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
                        <div>
                            <img src={mLogo} alt="mLab Logo" height={40} />
                            <div style={{ fontSize: 11, fontWeight: 500, color: 'rgba(255,255,255,0.38)', letterSpacing: '0.18em', textTransform: 'uppercase', marginTop: 4 }}>
                                {event.eventName}
                            </div>
                        </div>
                        <div style={{ height: '30px', width: '1px', background: 'rgba(255,255,255,0.1)' }} />

                        <button
                            onClick={() => navigate('/admin')}
                            style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.2)', color: '#fff', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem' }}
                            onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
                            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                        >
                            <ArrowLeft size={14} /> Exit Door View
                        </button>

                        {/* Hide print button if event is not active */}
                        {isActive && (
                            <button
                                onClick={handlePrint}
                                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.2)', color: '#fff', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem' }}
                                onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.15)'}
                                onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                            >
                                <Printer size={14} /> Print QR Code
                            </button>
                        )}
                    </div>

                    {/* Dynamic Status Pill */}
                    <div style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        background: isActive ? 'rgba(148,199,61,0.1)' : 'rgba(255,255,255,0.05)',
                        border: isActive ? '1px solid rgba(148,199,61,0.25)' : '1px solid rgba(255,255,255,0.1)',
                        borderRadius: 20, padding: '8px 16px',
                    }}>
                        <div style={{ width: 8, height: 8, borderRadius: '50%', background: isActive ? GREEN : 'rgba(255,255,255,0.4)' }} />
                        <span style={{ fontSize: 11, fontWeight: 600, color: isActive ? GREEN : 'rgba(255,255,255,0.5)', letterSpacing: '0.14em', textTransform: 'uppercase' }}>
                            {isActive ? 'Live Event Register' : isConcluded ? 'Event Concluded' : 'Event Upcoming'}
                        </span>
                    </div>
                </div>

                {/* 🚀 CONDITIONAL BODY VIEW 🚀 */}
                {isActive ? (
                    <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
                        {/* QR Panel */}
                        <div style={{
                            flex: 1.2, display: 'flex', flexDirection: 'column',
                            alignItems: 'center', justifyContent: 'center', padding: '48px 40px',
                            borderRight: '1px solid rgba(255,255,255,0.06)'
                        }}>
                            <div style={{ marginBottom: 28, background: '#fff', padding: 14, borderRadius: 12 }}>
                                <QRCodeSVG
                                    value={checkInUrl}
                                    size={380}
                                    level="M"
                                    includeMargin={false}
                                    fgColor={MIDNIGHT}
                                />
                            </div>

                            <h2 style={{ fontFamily: 'system-ui', fontSize: 16, fontWeight: 600, color: 'rgba(255,255,255,0.55)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 20, textAlign: 'center' }}>
                                Scan with your phone camera
                            </h2>

                            <p style={{ fontSize: 14, fontWeight: 300, color: 'rgba(255,255,255,0.4)', textAlign: 'center', maxWidth: 340 }}>
                                {event.location.split(',')[0]} • {formatEventDuration(event.date, (event as any).endDate)}
                            </p>
                        </div>

                        {/* Roster Panel */}
                        <div style={{ width: 440, display: 'flex', flexDirection: 'column', padding: '24px 20px', background: 'rgba(0,0,0,0.1)' }}>
                            <div style={{
                                display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16,
                                paddingBottom: 14, borderBottom: '1px solid rgba(255,255,255,0.06)'
                            }}>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="1.8" strokeLinecap="round">
                                    <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" />
                                    <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
                                </svg>
                                <span style={{ fontFamily: 'system-ui', fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.45)', letterSpacing: '0.16em', textTransform: 'uppercase', flex: 1 }}>
                                    Today's Live Board
                                </span>
                                <span style={{
                                    fontFamily: 'system-ui', fontSize: 12, fontWeight: 700, color: GREEN,
                                    background: 'rgba(148,199,61,0.14)', border: '1px solid rgba(148,199,61,0.25)',
                                    borderRadius: 10, padding: '2px 10px'
                                }}>
                                    {recentScans.length} Checked In Today
                                </span>
                            </div>

                            <div className="hide-scroll" style={{ display: 'flex', flexDirection: 'column', gap: 10, overflowY: 'auto', flex: 1, paddingRight: 4 }}>
                                {recentScans.length === 0 ? (
                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, opacity: .3, paddingTop: 32, gap: 10 }}>
                                        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.4" strokeLinecap="round">
                                            <rect x="2" y="3" width="20" height="14" rx="3" /><path d="M8 21h8M12 17v4" />
                                        </svg>
                                        <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', textAlign: 'center', fontWeight: 300 }}>
                                            Awaiting first check-in…
                                        </p>
                                    </div>
                                ) : (
                                    recentScans.map((scan: any, idx: number) => (
                                        <div
                                            key={scan.id}
                                            style={{
                                                display: 'flex', alignItems: 'center', gap: 10,
                                                background: 'rgba(255,255,255,0.04)',
                                                border: '1px solid rgba(255,255,255,0.08)',
                                                borderRadius: 12, padding: '12px 14px',
                                                animation: 'slideInRight .3s ease both',
                                                animationDelay: `${idx * 0.04}s`
                                            }}
                                        >
                                            <div style={{
                                                width: 24, height: 24, borderRadius: 7, flexShrink: 0,
                                                background: 'rgba(148,199,61,0.14)',
                                                border: '1px solid rgba(148,199,61,0.28)',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center'
                                            }}>
                                                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke={GREEN} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                    <polyline points="2,6 5,9 10,3" />
                                                </svg>
                                            </div>
                                            <div style={{ flex: 1 }}>
                                                <div style={{ fontSize: 14, fontWeight: 600, color: '#fff', letterSpacing: '0.02em' }}>
                                                    {(() => {
                                                        const names = scan.guestName.split(' ');
                                                        return names.length > 1 ? `${names[0]} ${names[names.length - 1].charAt(0)}.` : scan.guestName;
                                                    })()}
                                                </div>
                                            </div>
                                            <TimePill label="CHECK-IN" time={scan.timestamp} color="#3b82f6" />
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    </div>
                ) : (
                    // 🚀 LOCKED STATE UI 🚀
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px' }}>
                        <div style={{ 
                            width: 80, height: 80, borderRadius: 40, 
                            background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 24
                        }}>
                            {isConcluded ? <Lock size={32} color="rgba(255,255,255,0.5)" /> : <Clock size={32} color={GREEN} />}
                        </div>
                        
                        <h2 style={{ fontFamily: 'system-ui', fontSize: 24, fontWeight: 700, color: '#fff', margin: 0, letterSpacing: '0.02em' }}>
                            {isConcluded ? "Check-In Closed" : "Event Starting Soon"}
                        </h2>
                        
                        <p style={{ fontSize: 15, color: 'rgba(255,255,255,0.5)', marginTop: 12, textAlign: 'center', maxWidth: 420, lineHeight: 1.5 }}>
                            {isConcluded 
                                ? "This event has concluded. Thank you to everyone who attended!" 
                                : `The check-in register will open on ${eventStart.toLocaleDateString('en-ZA', { day: 'numeric', month: 'long', year: 'numeric' })}.`}
                        </p>
                    </div>
                )}
            </div>
        </>
    );
};




// // src/pages/Ecosystem/EventKioskPage/EventKioskPage.tsx

// import React, { useEffect, useState } from 'react';
// import { useParams, useNavigate } from 'react-router-dom';
// import { doc, onSnapshot, query, collection, where, orderBy, limit, getDoc } from 'firebase/firestore';
// import { QRCodeSVG } from 'qrcode.react';
// import { db } from '../../../lib/firebase';
// import { Loader2, ArrowLeft, Printer } from 'lucide-react';
// import moment from 'moment';
// import type { EcosystemEvent } from '../../../types/ecosystem.types';

// import mLogo from '../../../assets/logo/mlab_logo_white.png';
// import mLogoDark from '../../../assets/logo/mlab_logo.png'; // Used for the white printout

// const MIDNIGHT = '#073f4e';
// const GREEN = '#94c73d';

// // ─── SMART DATE FORMATTER ───
// const formatEventDuration = (startIso: string, endIso?: string) => {
//     if (!startIso) return "Date TBD";
//     const start = new Date(startIso);
//     const end = endIso ? new Date(endIso) : start;

//     start.setHours(0, 0, 0, 0);
//     end.setHours(0, 0, 0, 0);

//     const diffDays = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
//     const startStr = start.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' });

//     if (diffDays <= 1) return startStr;

//     if (start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear()) {
//         const monthYear = start.toLocaleDateString('en-ZA', { month: 'short', year: 'numeric' });
//         return `${start.getDate()} – ${end.getDate()} ${monthYear} (${diffDays} Days)`;
//     }

//     const endStr = end.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' });
//     return `${startStr} – ${endStr} (${diffDays} Days)`;
// };

// // ─── Animations & Print Styles ───────────────────────────────────────────────
// const KioskStyles = () => (
//     <style>
//         {`
//             @keyframes popBubble {
//                 0% { transform: scale(0.4); opacity: 0; }
//                 60% { transform: scale(1.15); opacity: 1; }
//                 80% { transform: scale(0.95); }
//                 100% { transform: scale(1); opacity: 1; }
//             }
//             @keyframes slideInRight {
//                 from { transform: translateX(20px); opacity: 0; }
//                 to { transform: translateX(0); opacity: 1; }
//             }
//             .hide-scroll::-webkit-scrollbar {
//                 display: none;
//             }

//             /* 🖨️ PRINT MEDIA STYLES - Formats a beautiful A4 poster 🖨️ */
//             @media print {
//                 body, html {
//                     background: white !important;
//                     margin: 0 !important;
//                     padding: 0 !important;
//                 }
//                 .no-print {
//                     display: none !important;
//                 }
//                 .print-only {
//                     display: flex !important;
//                 }
//                 .print-container {
//                     display: flex;
//                     flex-direction: column;
//                     align-items: center;
//                     justify-content: center;
//                     height: 100vh;
//                     text-align: center;
//                     color: black !important;
//                 }
//                 .print-qr-wrapper {
//                     margin: 40px 0;
//                 }
//             }
            
//             /* Hide print-only elements on the screen */
//             .print-only {
//                 display: none;
//             }
//         `}
//     </style>
// );

// // ─── TIME PILL ───────────────────────────────────────────────────────────────
// function TimePill({ label, time, color }: { label: string; time: string | number | undefined; color: string }) {
//     if (!time) return null;
//     const isRecent = Date.now() - new Date(time).getTime() < 15000;

//     return (
//         <div style={{
//             fontSize: 10, fontWeight: 700, color: '#fff', backgroundColor: color,
//             padding: '3px 6px', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, flex: 1,
//             animation: isRecent ? 'popBubble 0.6s cubic-bezier(0.175, 0.885, 0.32, 1.275) both' : 'none',
//             boxShadow: isRecent ? `0 0 12px ${color}80` : 'none',
//             transition: 'box-shadow 1s ease-out',
//             maxWidth: 'fit-content'
//         }}>
//             <span>{label}</span>
//             <span style={{ opacity: 0.8, fontWeight: 500 }}>{moment(time).format('HH:mm')}</span>
//         </div>
//     );
// }

// export const EventKioskPage: React.FC = () => {
//     const { eventId } = useParams<{ eventId: string }>();
//     const navigate = useNavigate();

//     const [event, setEvent] = useState<EcosystemEvent | null>(null);
//     const [recentScans, setRecentScans] = useState<any[]>([]);
//     const [loading, setLoading] = useState(true);

//     // const checkInUrl = `${window.location.origin}/event/${eventId}`;
//     // const checkInUrl = `https://mlab-guest-portal.web.app/guest/${eventId}`;
//     const checkInUrl = `https://mlab-guest-portal.firebaseapp.com/guest/${eventId}`;

//     useEffect(() => {
//         if (!eventId) return;

//         const fetchInitialEvent = async () => {
//             try {
//                 const docRef = doc(db, 'events', eventId);
//                 const snap = await getDoc(docRef);
//                 if (snap.exists()) {
//                     setEvent({ id: snap.id, ...snap.data() } as EcosystemEvent);
//                 }
//             } catch (err) {
//                 console.error("Failed to load event", err);
//             } finally {
//                 setLoading(false);
//             }
//         };

//         fetchInitialEvent();

//         const unsubEvent = onSnapshot(doc(db, 'events', eventId), (snap) => {
//             if (snap.exists()) {
//                 setEvent(prev => ({ ...prev, ...snap.data() } as EcosystemEvent));
//             }
//         });

//         // ONLY SHOW TODAY'S CHECK-INS ON THE TV
//         const todayStart = new Date();
//         todayStart.setHours(0, 0, 0, 0);

//         const todayEnd = new Date();
//         todayEnd.setHours(23, 59, 59, 999);

//         const q = query(
//             collection(db, 'event_checkins'),
//             where('eventId', '==', eventId),
//             where('timestamp', '>=', todayStart.toISOString()),
//             where('timestamp', '<=', todayEnd.toISOString()),
//             orderBy('timestamp', 'desc'),
//             limit(12)
//         );

//         const unsubScans = onSnapshot(q, (snapshot) => {
//             const scans = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
//             setRecentScans(scans);
//         });

//         return () => {
//             unsubEvent();
//             unsubScans();
//         };
//     }, [eventId]);

//     // Handle Printing
//     const handlePrint = () => {
//         window.print();
//     };

//     if (loading) {
//         return (
//             <div style={{ minHeight: '100vh', background: MIDNIGHT, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
//                 <Loader2 className="lfm-spin" color={GREEN} size={48} />
//             </div>
//         );
//     }

//     if (!event) {
//         return (
//             <div style={{ minHeight: '100vh', background: MIDNIGHT, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'white' }}>
//                 <h1 style={{ fontFamily: 'system-ui' }}>Event Not Found</h1>
//                 <button
//                     onClick={() => navigate('/admin')}
//                     style={{ marginTop: 20, background: GREEN, color: MIDNIGHT, border: 'none', padding: '10px 20px', borderRadius: '8px', cursor: 'pointer', fontWeight: 600 }}
//                 >
//                     Return to Dashboard
//                 </button>
//             </div>
//         );
//     }

//     return (
//         <>
//             <KioskStyles />

//             {/* 🖨️ THE PRINT-ONLY VIEW (Hidden on screen, shown on paper) 🖨️ */}
//             <div className="print-only print-container">
//                 <img src={mLogoDark} alt="mLab Logo" height={60} style={{ marginBottom: '20px' }} />
//                 <div style={{ fontSize: '14px', fontWeight: 600, color: GREEN, letterSpacing: '0.15em', textTransform: 'uppercase' }}>
//                     Welcome to mLab
//                 </div>
//                 <h1 style={{ fontSize: '48px', fontWeight: 800, margin: '10px 0', color: MIDNIGHT, fontFamily: 'system-ui' }}>
//                     {event.eventName}
//                 </h1>
//                 <p style={{ fontSize: '18px', color: '#6b6b6b', margin: '0 0 20px 0', fontFamily: 'system-ui' }}>
//                     {event.location.split(',')[0]} • {formatEventDuration(event.date, (event as any).endDate)}
//                 </p>

//                 <div className="print-qr-wrapper">
//                     <QRCodeSVG value={checkInUrl} size={450} level="M" fgColor={MIDNIGHT} />
//                 </div>

//                 <h2 style={{ fontSize: '24px', fontWeight: 700, margin: '0', color: MIDNIGHT, fontFamily: 'system-ui' }}>
//                     Scan to Check In
//                 </h2>
//                 <p style={{ fontSize: '16px', color: '#6b6b6b', marginTop: '10px', fontFamily: 'system-ui' }}>
//                     Point your phone's camera at the QR code to register your attendance.
//                 </p>
//             </div>

//             {/* 📺 THE TV / SCREEN VIEW (Hidden when printing) 📺 */}
//             <div className="no-print" style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: '100vh', background: MIDNIGHT, position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, overflow: 'hidden' }}>

//                 {/* Decorative orbs */}
//                 <div style={{ position: 'absolute', top: -80, right: -80, width: 260, height: 260, borderRadius: '50%', background: GREEN, opacity: .06, pointerEvents: 'none' }} />
//                 <div style={{ position: 'absolute', bottom: -60, left: -60, width: 200, height: 200, borderRadius: '50%', background: GREEN, opacity: .04, pointerEvents: 'none' }} />

//                 {/* Header */}
//                 <div style={{
//                     display: 'flex', alignItems: 'center', justifyContent: 'space-between',
//                     padding: '18px 32px', borderBottom: '1px solid rgba(255,255,255,0.06)'
//                 }}>
//                     <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
//                         <div>
//                             <img src={mLogo} alt="mLab Logo" height={40} />
//                             <div style={{ fontSize: 11, fontWeight: 500, color: 'rgba(255,255,255,0.38)', letterSpacing: '0.18em', textTransform: 'uppercase', marginTop: 4 }}>
//                                 {event.eventName}
//                             </div>
//                         </div>
//                         <div style={{ height: '30px', width: '1px', background: 'rgba(255,255,255,0.1)' }} />

//                         <button
//                             onClick={() => navigate('/admin')}
//                             style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.2)', color: '#fff', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem' }}
//                             onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
//                             onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
//                         >
//                             <ArrowLeft size={14} /> Exit Door View
//                         </button>

//                         <button
//                             onClick={handlePrint}
//                             style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.2)', color: '#fff', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem' }}
//                             onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.15)'}
//                             onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
//                         >
//                             <Printer size={14} /> Print QR Code
//                         </button>
//                     </div>

//                     {/* Live status pill */}
//                     <div style={{
//                         display: 'flex', alignItems: 'center', gap: 8,
//                         background: 'rgba(148,199,61,0.1)',
//                         border: '1px solid rgba(148,199,61,0.25)',
//                         borderRadius: 20, padding: '8px 16px',
//                     }}>
//                         <div style={{ width: 8, height: 8, borderRadius: '50%', background: GREEN }} />
//                         <span style={{ fontSize: 11, fontWeight: 600, color: GREEN, letterSpacing: '0.14em', textTransform: 'uppercase' }}>
//                             Live Event Register
//                         </span>
//                     </div>
//                 </div>

//                 {/* Body */}
//                 <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

//                     {/* QR Panel */}
//                     <div style={{
//                         flex: 1.2, display: 'flex', flexDirection: 'column',
//                         alignItems: 'center', justifyContent: 'center', padding: '48px 40px',
//                         borderRight: '1px solid rgba(255,255,255,0.06)'
//                     }}>
//                         {/* QR frame */}
//                         <div style={{
//                             marginBottom: 28,
//                             background: '#fff',
//                             padding: 14,
//                             borderRadius: 12
//                         }}>
//                             <QRCodeSVG
//                                 value={checkInUrl}
//                                 size={380}
//                                 level="M"
//                                 includeMargin={false}
//                                 fgColor={MIDNIGHT}
//                             />
//                         </div>

//                         <h2 style={{ fontFamily: 'system-ui', fontSize: 16, fontWeight: 600, color: 'rgba(255,255,255,0.55)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 20, textAlign: 'center' }}>
//                             Scan with your phone camera
//                         </h2>

//                         <p style={{ fontSize: 14, fontWeight: 300, color: 'rgba(255,255,255,0.4)', textAlign: 'center', maxWidth: 340 }}>
//                             {event.location.split(',')[0]} • {formatEventDuration(event.date, (event as any).endDate)}
//                         </p>
//                     </div>

//                     {/* Roster Panel */}
//                     <div style={{ width: 440, display: 'flex', flexDirection: 'column', padding: '24px 20px', background: 'rgba(0,0,0,0.1)' }}>
//                         <div style={{
//                             display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16,
//                             paddingBottom: 14, borderBottom: '1px solid rgba(255,255,255,0.06)'
//                         }}>
//                             <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="1.8" strokeLinecap="round">
//                                 <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" />
//                                 <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
//                             </svg>
//                             <span style={{ fontFamily: 'system-ui', fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.45)', letterSpacing: '0.16em', textTransform: 'uppercase', flex: 1 }}>
//                                 Today's Live Board
//                             </span>
//                             <span style={{
//                                 fontFamily: 'system-ui', fontSize: 12, fontWeight: 700, color: GREEN,
//                                 background: 'rgba(148,199,61,0.14)', border: '1px solid rgba(148,199,61,0.25)',
//                                 borderRadius: 10, padding: '2px 10px'
//                             }}>
//                                 {recentScans.length} Checked In Today
//                             </span>
//                         </div>

//                         <div className="hide-scroll" style={{ display: 'flex', flexDirection: 'column', gap: 10, overflowY: 'auto', flex: 1, paddingRight: 4 }}>
//                             {recentScans.length === 0 ? (
//                                 <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, opacity: .3, paddingTop: 32, gap: 10 }}>
//                                     <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.4" strokeLinecap="round">
//                                         <rect x="2" y="3" width="20" height="14" rx="3" /><path d="M8 21h8M12 17v4" />
//                                     </svg>
//                                     <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', textAlign: 'center', fontWeight: 300 }}>
//                                         Awaiting first check-in…
//                                     </p>
//                                 </div>
//                             ) : (
//                                 recentScans.map((scan: any, idx: number) => (
//                                     <div
//                                         key={scan.id}
//                                         style={{
//                                             display: 'flex', alignItems: 'center', gap: 10,
//                                             background: 'rgba(255,255,255,0.04)',
//                                             border: '1px solid rgba(255,255,255,0.08)',
//                                             borderRadius: 12, padding: '12px 14px',
//                                             animation: 'slideInRight .3s ease both',
//                                             animationDelay: `${idx * 0.04}s`
//                                         }}
//                                     >
//                                         <div style={{
//                                             width: 24, height: 24, borderRadius: 7, flexShrink: 0,
//                                             background: 'rgba(148,199,61,0.14)',
//                                             border: '1px solid rgba(148,199,61,0.28)',
//                                             display: 'flex', alignItems: 'center', justifyContent: 'center'
//                                         }}>
//                                             <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke={GREEN} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
//                                                 <polyline points="2,6 5,9 10,3" />
//                                             </svg>
//                                         </div>
//                                         <div style={{ flex: 1 }}>
//                                             <div style={{ fontSize: 14, fontWeight: 600, color: '#fff', letterSpacing: '0.02em' }}>
//                                                 {(() => {
//                                                     const names = scan.guestName.split(' ');
//                                                     return names.length > 1 ? `${names[0]} ${names[names.length - 1].charAt(0)}.` : scan.guestName;
//                                                 })()}
//                                             </div>
//                                         </div>
//                                         <TimePill label="CHECK-IN" time={scan.timestamp} color="#3b82f6" />
//                                     </div>
//                                 ))
//                             )}
//                         </div>
//                     </div>

//                 </div>
//             </div>
//         </>
//     );
// };