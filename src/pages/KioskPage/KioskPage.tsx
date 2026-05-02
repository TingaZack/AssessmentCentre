// src/pages/KioskPage/KioskPage.tsx
import React, { useEffect, useRef, useState } from 'react';
import { collection, onSnapshot, query, where, getDocs } from 'firebase/firestore';
import { QRCodeSVG } from 'qrcode.react';
import { db } from '../../lib/firebase';
import moment from 'moment';

import mLogo from '../../assets/logo/mlab_logo_white.png';


const MIDNIGHT = '#073f4e';
const GREEN = '#94c73d';

interface KioskSession {
    id: string;
    cohortId: string;
    cohortName: string;
    pin: string;
    facilitatorId: string;
}

// ─── PIN Box ─────────────────────────────────────────────────────────────────
function PinBox({ char, isFilled, isActive }: { char: string; isFilled: boolean; isActive: boolean }) {
    return (
        <div style={{
            width: 46, height: 58,
            borderRadius: 10,
            background: isFilled ? 'rgba(148,199,61,0.1)' : 'rgba(255,255,255,0.05)',
            border: `1.5px solid ${isActive ? GREEN : isFilled ? 'rgba(148,199,61,0.4)' : 'rgba(255,255,255,0.1)'}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 26, fontWeight: '700', color: '#fff',
            transition: 'border-color .18s, background .18s',
        }}>
            {char ? '•' : ''}
        </div>
    );
}

// ─── Gatekeeper screen ───────────────────────────────────────────────────────
function GatekeeperView({
    onSuccess,
}: {
    onSuccess: (session: KioskSession) => void;
}) {
    const [pin, setPin] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);
    const todayString = moment().format('YYYY-MM-DD');

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (pin.length !== 6) return;
        setLoading(true);
        setError(null);
        try {
            const q = query(
                collection(db, 'kiosk_sessions'),
                where('pin', '==', pin),
                where('date', '==', todayString),
                where('status', '==', 'active'),
            );
            const snap = await getDocs(q);
            if (snap.empty) {
                setError('Invalid or expired PIN. Please check your email.');
                setPin('');
            } else {
                const d = snap.docs[0].data();
                onSuccess({
                    id: snap.docs[0].id,
                    cohortId: d.cohortId,
                    cohortName: d.cohortName || 'CodeTribe Class',
                    pin: d.pin,
                    facilitatorId: d.facilitatorId,
                });
            }
        } catch {
            setError('Network error. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{
            flex: 1, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            minHeight: '100vh', padding: '40px 24px',
            background: MIDNIGHT, overflow: 'hidden',
            position: 'absolute', top: 0, left: 0, right: 0, bottom: 0
        }}>
            {/* Decorative orbs */}
            <div style={{ position: 'absolute', top: -80, right: -80, width: 260, height: 260, borderRadius: '50%', background: GREEN, opacity: .06, pointerEvents: 'none' }} />
            <div style={{ position: 'absolute', bottom: -60, left: -60, width: 200, height: 200, borderRadius: '50%', background: GREEN, opacity: .04, pointerEvents: 'none' }} />

            {/* Icon */}
            <div style={{
                width: 72, height: 72, borderRadius: 20,
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.1)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                marginBottom: 24,
            }}>
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke={GREEN} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="3" width="20" height="14" rx="3" />
                    <path d="M8 21h8M12 17v4" />
                </svg>
            </div>

            <h1 style={{ fontFamily: 'system-ui', fontSize: 26, fontWeight: 700, color: '#fff', letterSpacing: '.04em', textTransform: 'uppercase', textAlign: 'center', marginBottom: 10 }}>
                Hub Kiosk Activation
            </h1>
            <p style={{ fontSize: 14, fontWeight: 300, color: 'rgba(255,255,255,0.5)', textAlign: 'center', lineHeight: 1.65, maxWidth: 340, marginBottom: 32 }}>
                Enter the 6-digit PIN emailed to the facilitator to project today's attendance code.
            </p>

            {/* Card */}
            <form
                onSubmit={handleSubmit}
                style={{
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: 18, padding: 28, width: '100%', maxWidth: 360,
                }}
            >
                <span style={{ fontFamily: 'system-ui', fontSize: 10, fontWeight: 600, letterSpacing: '.18em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)', marginBottom: 12, display: 'block' }}>
                    Session PIN
                </span>

                {/* PIN boxes — backed by a hidden input */}
                <div
                    style={{ display: 'flex', gap: 8, marginBottom: 20, justifyContent: 'center', cursor: 'text' }}
                    onClick={() => inputRef.current?.focus()}
                >
                    {[0, 1, 2, 3, 4, 5].map(i => (
                        <PinBox
                            key={i}
                            char={pin[i] || ''}
                            isFilled={i < pin.length}
                            isActive={i === pin.length}
                        />
                    ))}
                    <input
                        ref={inputRef}
                        type="tel"
                        inputMode="numeric"
                        maxLength={6}
                        value={pin}
                        onChange={e => { setPin(e.target.value.replace(/\D/g, '').slice(0, 6)); setError(null); }}
                        autoFocus
                        style={{ position: 'absolute', opacity: 0, width: 1, height: 1 }}
                    />
                </div>

                {error && (
                    <div style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        background: 'rgba(220,38,38,0.12)', border: '1px solid rgba(220,38,38,0.25)',
                        borderRadius: 8, padding: '10px 14px', marginBottom: 18,
                        fontSize: 13, color: '#fca5a5',
                    }}>
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fca5a5" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="9" /><path d="M12 8v4M12 16h.01" /></svg>
                        {error}
                    </div>
                )}

                <button
                    type="submit"
                    disabled={loading || pin.length !== 6}
                    style={{
                        width: '100%', height: 50,
                        background: pin.length === 6 ? GREEN : 'rgba(148,199,61,0.3)',
                        border: 'none', borderRadius: 12,
                        fontFamily: 'system-ui', fontSize: 13, fontWeight: 700,
                        letterSpacing: '.16em', textTransform: 'uppercase',
                        color: MIDNIGHT,
                        cursor: pin.length === 6 ? 'pointer' : 'default',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                        transition: 'opacity .2s',
                        opacity: loading ? 0.7 : 1,
                    }}
                >
                    {loading ? 'Verifying…' : 'Activate Kiosk'}
                    {!loading && (
                        <div style={{ width: 26, height: 26, background: MIDNIGHT, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke={GREEN} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M2 7h10M8 3l4 4-4 4" />
                            </svg>
                        </div>
                    )}
                </button>
            </form>

            <p style={{ marginTop: 24, fontSize: 11, fontWeight: 300, color: 'rgba(255,255,255,0.25)', textAlign: 'center' }}>
                © {new Date().getFullYear()} Mobile Applications Laboratory NPC
            </p>
        </div>
    );
}

// ─── Active Kiosk screen ─────────────────────────────────────────────────────
function ActiveKioskView({ session }: { session: KioskSession }) {
    const [qrData, setQrData] = useState('');
    const [timer, setTimer] = useState(15);
    const [liveScans, setLiveScans] = useState<any[]>([]);
    const todayString = moment().format('YYYY-MM-DD');

    /* 🚀 Rotating QR - UPDATED TO FALLBACK URL 🚀 */
    useEffect(() => {
        const generate = () => {
            const params = new URLSearchParams({
                c: session.cohortId || '',
                f: session.facilitatorId || '',
                t: Date.now().toString()
            });

            // Dynamically grab the current domain so this works on localhost AND production
            // const APP_URL = window.location.origin;
            const APP_URL = 'https://mlabassessmentcenter.web.app';

            // The QR Code is now a scannable web link!
            const fallbackUrl = `${APP_URL}/app-scanner-required?${params.toString()}`;

            setQrData(fallbackUrl);
            setTimer(15);
        };

        generate();
        const iv = setInterval(() => {
            setTimer(prev => {
                if (prev <= 1) { generate(); return 15; }
                return prev - 1;
            });
        }, 1000);
        return () => clearInterval(iv);
    }, [session]);

    /* Live scans listener */
    useEffect(() => {
        const q = query(
            collection(db, 'live_attendance_scans'),
            where('cohortId', '==', session.cohortId),
            where('dateString', '==', todayString),
        );
        const unsub = onSnapshot(q, snap => {
            const scans = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            scans.sort((a: any, b: any) => b.scannedAt - a.scannedAt);
            setLiveScans(scans);
        });
        return unsub;
    }, [session, todayString]);

    const isUrgent = timer <= 5;

    return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: '100vh', background: MIDNIGHT, position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>

            {/* Header */}
            <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '18px 32px', borderBottom: '1px solid rgba(255,255,255,0.06)',
            }}>
                <div>
                    {/* <div style={{ display: 'flex', alignItems: 'baseline' }}>
                        <span style={{ fontSize: 24, fontWeight: 800, color: GREEN, letterSpacing: -0.5 }}>m</span>
                        <span style={{ fontSize: 24, fontWeight: 800, color: '#fff', letterSpacing: -0.5 }}>lab</span>
                    </div> */}
                    <img src={mLogo} alt="mLab Logo" height={40} />
                    <div style={{ fontSize: 11, fontWeight: 500, color: 'rgba(255,255,255,0.38)', letterSpacing: '0.18em', textTransform: 'uppercase', marginTop: 2 }}>
                        {session.cohortName}
                    </div>
                </div>

                {/* Live status pill */}
                <div style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    background: 'rgba(148,199,61,0.1)',
                    border: '1px solid rgba(148,199,61,0.25)',
                    borderRadius: 20, padding: '8px 16px',
                }}>
                    <div style={{
                        width: 8, height: 8, borderRadius: '50%', background: GREEN,
                    }} />
                    <span style={{ fontSize: 11, fontWeight: 600, color: GREEN, letterSpacing: '0.14em', textTransform: 'uppercase' }}>
                        Secure Register Active
                    </span>
                </div>
            </div>

            {/* Body */}
            <div style={{ display: 'flex', flex: 1 }}>

                {/* QR Panel */}
                <div style={{
                    flex: 1.2, display: 'flex', flexDirection: 'column',
                    alignItems: 'center', justifyContent: 'center', padding: '48px 40px',
                    borderRight: '1px solid rgba(255,255,255,0.06)',
                }}>
                    {/* QR frame */}
                    <div style={{
                        marginBottom: 28,
                        transition: 'background .25s',
                        background: isUrgent ? 'rgba(220,38,38,0.08)' : '#fff',
                    }}>
                        {qrData && (
                            <QRCodeSVG
                                value={qrData}
                                size={380}
                                level="H"
                                includeMargin={false}
                                fgColor={MIDNIGHT}
                            />
                        )}
                    </div>

                    <h2 style={{ fontFamily: 'system-ui', fontSize: 16, fontWeight: 600, color: 'rgba(255,255,255,0.55)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 20, textAlign: 'center' }}>
                        Scan with the CodeTribe App
                    </h2>

                    {/* Timer */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={isUrgent ? '#dc2626' : 'rgba(255,255,255,0.45)'} strokeWidth="1.8" strokeLinecap="round">
                            <circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 3" />
                        </svg>
                        <span style={{ fontSize: 22, fontWeight: 700, color: isUrgent ? '#dc2626' : '#fff', minWidth: 32, textAlign: 'center' }}>{timer}</span>
                        <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', fontWeight: 300 }}>seconds until refresh</span>
                    </div>

                    {/* Progress bar */}
                    <div style={{ width: '100%', maxWidth: 280, height: 4, background: 'rgba(255,255,255,0.08)', borderRadius: 2, overflow: 'hidden' }}>
                        <div style={{
                            height: '100%', borderRadius: 2,
                            background: isUrgent ? '#dc2626' : GREEN,
                            width: `${(timer / 15) * 100}%`,
                            transition: 'width 1s linear, background .3s',
                        }} />
                    </div>
                </div>

                {/* Roster Panel */}
                <div style={{ width: 280, display: 'flex', flexDirection: 'column', padding: '24px 20px' }}>
                    <div style={{
                        display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16,
                        paddingBottom: 14, borderBottom: '1px solid rgba(255,255,255,0.06)',
                    }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="1.8" strokeLinecap="round">
                            <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" />
                            <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
                        </svg>
                        <span style={{ fontFamily: 'system-ui', fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.45)', letterSpacing: '0.16em', textTransform: 'uppercase', flex: 1 }}>
                            Live Check-ins
                        </span>
                        <span style={{
                            fontFamily: 'system-ui', fontSize: 12, fontWeight: 700, color: GREEN,
                            background: 'rgba(148,199,61,0.14)', border: '1px solid rgba(148,199,61,0.25)',
                            borderRadius: 10, padding: '2px 10px',
                        }}>
                            {liveScans.length}
                        </span>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 7, overflowY: 'auto', flex: 1 }}>
                        {liveScans.length === 0 ? (
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, opacity: .3, paddingTop: 32, gap: 10 }}>
                                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.4" strokeLinecap="round">
                                    <rect x="2" y="3" width="20" height="14" rx="3" /><path d="M8 21h8M12 17v4" />
                                </svg>
                                <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', textAlign: 'center', fontWeight: 300 }}>
                                    Awaiting first scan…
                                </p>
                            </div>
                        ) : (
                            liveScans.map((scan: any, idx) => (
                                <div
                                    key={scan.id}
                                    style={{
                                        display: 'flex', alignItems: 'center', gap: 10,
                                        background: 'rgba(255,255,255,0.04)',
                                        border: '1px solid rgba(255,255,255,0.06)',
                                        borderRadius: 10, padding: '10px 12px',
                                        animation: 'slideInRight .3s ease both',
                                        animationDelay: `${idx * 0.04}s`,
                                    }}
                                >
                                    <div style={{
                                        width: 24, height: 24, borderRadius: 7, flexShrink: 0,
                                        background: 'rgba(148,199,61,0.14)',
                                        border: '1px solid rgba(148,199,61,0.28)',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    }}>
                                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke={GREEN} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <polyline points="2,6 5,9 10,3" />
                                        </svg>
                                    </div>
                                    <div>
                                        <div style={{ fontSize: 13, fontWeight: 600, color: '#fff', lineHeight: 1.2 }}>{scan.learnerName}</div>
                                        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', fontWeight: 300, marginTop: 2 }}>
                                            {moment(scan.scannedAt).format('HH:mm:ss')}
                                        </div>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>

            </div>
        </div >
    );
}

// ─── Root ─────────────────────────────────────────────────────────────────────
export const KioskPage: React.FC = () => {
    const [activeSession, setActiveSession] = useState<KioskSession | null>(null);

    return activeSession
        ? <ActiveKioskView session={activeSession} />
        : <GatekeeperView onSuccess={setActiveSession} />;
};




// import React, { useEffect, useRef, useState } from 'react';
// import { collection, onSnapshot, query, where, getDocs } from 'firebase/firestore';
// import { QRCodeSVG } from 'qrcode.react';
// import { db } from '../../lib/firebase';
// import moment from 'moment';

// const MIDNIGHT = '#073f4e';
// const GREEN = '#94c73d';

// interface KioskSession {
//     id: string;
//     cohortId: string;
//     cohortName: string;
//     pin: string;
//     facilitatorId: string;
// }

// // ─── PIN Box ─────────────────────────────────────────────────────────────────
// function PinBox({ char, isFilled, isActive }: { char: string; isFilled: boolean; isActive: boolean }) {
//     return (
//         <div style={{
//             width: 46, height: 58,
//             borderRadius: 10,
//             background: isFilled ? 'rgba(148,199,61,0.1)' : 'rgba(255,255,255,0.05)',
//             border: `1.5px solid ${isActive ? GREEN : isFilled ? 'rgba(148,199,61,0.4)' : 'rgba(255,255,255,0.1)'}`,
//             display: 'flex', alignItems: 'center', justifyContent: 'center',
//             fontSize: 26, fontWeight: '700', color: '#fff',
//             transition: 'border-color .18s, background .18s',
//         }}>
//             {char ? '•' : ''}
//         </div>
//     );
// }

// // ─── Gatekeeper screen ───────────────────────────────────────────────────────
// function GatekeeperView({
//     onSuccess,
// }: {
//     onSuccess: (session: KioskSession) => void;
// }) {
//     const [pin, setPin] = useState('');
//     const [error, setError] = useState<string | null>(null);
//     const [loading, setLoading] = useState(false);
//     const inputRef = useRef<HTMLInputElement>(null);
//     const todayString = moment().format('YYYY-MM-DD');

//     const handleSubmit = async (e: React.FormEvent) => {
//         e.preventDefault();
//         if (pin.length !== 6) return;
//         setLoading(true);
//         setError(null);
//         try {
//             const q = query(
//                 collection(db, 'kiosk_sessions'),
//                 where('pin', '==', pin),
//                 where('date', '==', todayString),
//                 where('status', '==', 'active'),
//             );
//             const snap = await getDocs(q);
//             if (snap.empty) {
//                 setError('Invalid or expired PIN. Please check your email.');
//                 setPin('');
//             } else {
//                 const d = snap.docs[0].data();
//                 onSuccess({
//                     id: snap.docs[0].id,
//                     cohortId: d.cohortId,
//                     cohortName: d.cohortName || 'CodeTribe Class',
//                     pin: d.pin,
//                     facilitatorId: d.facilitatorId,
//                 });
//             }
//         } catch {
//             setError('Network error. Please try again.');
//         } finally {
//             setLoading(false);
//         }
//     };

//     return (
//         <div style={{
//             flex: 1, display: 'flex', flexDirection: 'column',
//             alignItems: 'center', justifyContent: 'center',
//             minHeight: '100vh', padding: '40px 24px',
//             background: MIDNIGHT, overflow: 'hidden',
//             position: 'absolute', top: 0, left: 0, right: 0, bottom: 0
//         }}>
//             {/* Decorative orbs */}
//             <div style={{ position: 'absolute', top: -80, right: -80, width: 260, height: 260, borderRadius: '50%', background: GREEN, opacity: .06, pointerEvents: 'none' }} />
//             <div style={{ position: 'absolute', bottom: -60, left: -60, width: 200, height: 200, borderRadius: '50%', background: GREEN, opacity: .04, pointerEvents: 'none' }} />

//             {/* Icon */}
//             <div style={{
//                 width: 72, height: 72, borderRadius: 20,
//                 background: 'rgba(255,255,255,0.06)',
//                 border: '1px solid rgba(255,255,255,0.1)',
//                 display: 'flex', alignItems: 'center', justifyContent: 'center',
//                 marginBottom: 24,
//             }}>
//                 <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke={GREEN} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
//                     <rect x="2" y="3" width="20" height="14" rx="3" />
//                     <path d="M8 21h8M12 17v4" />
//                 </svg>
//             </div>

//             <h1 style={{ fontFamily: 'system-ui', fontSize: 26, fontWeight: 700, color: '#fff', letterSpacing: '.04em', textTransform: 'uppercase', textAlign: 'center', marginBottom: 10 }}>
//                 Hub Kiosk Activation
//             </h1>
//             <p style={{ fontSize: 14, fontWeight: 300, color: 'rgba(255,255,255,0.5)', textAlign: 'center', lineHeight: 1.65, maxWidth: 340, marginBottom: 32 }}>
//                 Enter the 6-digit PIN emailed to the facilitator to project today's attendance code.
//             </p>

//             {/* Card */}
//             <form
//                 onSubmit={handleSubmit}
//                 style={{
//                     background: 'rgba(255,255,255,0.05)',
//                     border: '1px solid rgba(255,255,255,0.1)',
//                     borderRadius: 18, padding: 28, width: '100%', maxWidth: 360,
//                 }}
//             >
//                 <span style={{ fontFamily: 'system-ui', fontSize: 10, fontWeight: 600, letterSpacing: '.18em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)', marginBottom: 12, display: 'block' }}>
//                     Session PIN
//                 </span>

//                 {/* PIN boxes — backed by a hidden input */}
//                 <div
//                     style={{ display: 'flex', gap: 8, marginBottom: 20, justifyContent: 'center', cursor: 'text' }}
//                     onClick={() => inputRef.current?.focus()}
//                 >
//                     {[0, 1, 2, 3, 4, 5].map(i => (
//                         <PinBox
//                             key={i}
//                             char={pin[i] || ''}
//                             isFilled={i < pin.length}
//                             isActive={i === pin.length}
//                         />
//                     ))}
//                     <input
//                         ref={inputRef}
//                         type="tel"
//                         inputMode="numeric"
//                         maxLength={6}
//                         value={pin}
//                         onChange={e => { setPin(e.target.value.replace(/\D/g, '').slice(0, 6)); setError(null); }}
//                         autoFocus
//                         style={{ position: 'absolute', opacity: 0, width: 1, height: 1 }}
//                     />
//                 </div>

//                 {error && (
//                     <div style={{
//                         display: 'flex', alignItems: 'center', gap: 8,
//                         background: 'rgba(220,38,38,0.12)', border: '1px solid rgba(220,38,38,0.25)',
//                         borderRadius: 8, padding: '10px 14px', marginBottom: 18,
//                         fontSize: 13, color: '#fca5a5',
//                     }}>
//                         <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fca5a5" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="9" /><path d="M12 8v4M12 16h.01" /></svg>
//                         {error}
//                     </div>
//                 )}

//                 <button
//                     type="submit"
//                     disabled={loading || pin.length !== 6}
//                     style={{
//                         width: '100%', height: 50,
//                         background: pin.length === 6 ? GREEN : 'rgba(148,199,61,0.3)',
//                         border: 'none', borderRadius: 12,
//                         fontFamily: 'system-ui', fontSize: 13, fontWeight: 700,
//                         letterSpacing: '.16em', textTransform: 'uppercase',
//                         color: MIDNIGHT,
//                         cursor: pin.length === 6 ? 'pointer' : 'default',
//                         display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
//                         transition: 'opacity .2s',
//                         opacity: loading ? 0.7 : 1,
//                     }}
//                 >
//                     {loading ? 'Verifying…' : 'Activate Kiosk'}
//                     {!loading && (
//                         <div style={{ width: 26, height: 26, background: MIDNIGHT, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
//                             <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke={GREEN} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
//                                 <path d="M2 7h10M8 3l4 4-4 4" />
//                             </svg>
//                         </div>
//                     )}
//                 </button>
//             </form>

//             <p style={{ marginTop: 24, fontSize: 11, fontWeight: 300, color: 'rgba(255,255,255,0.25)', textAlign: 'center' }}>
//                 © {new Date().getFullYear()} Mobile Applications Laboratory NPC
//             </p>
//         </div>
//     );
// }

// // ─── Active Kiosk screen ─────────────────────────────────────────────────────
// function ActiveKioskView({ session }: { session: KioskSession }) {
//     const [qrData, setQrData] = useState('');
//     const [timer, setTimer] = useState(15);
//     const [liveScans, setLiveScans] = useState<any[]>([]);
//     const todayString = moment().format('YYYY-MM-DD');

//     /* Rotating QR */
//     useEffect(() => {
//         const generate = () => {
//             setQrData(JSON.stringify({ c: session.cohortId, f: session.facilitatorId, t: Date.now() }));
//             setTimer(15);
//         };
//         generate();
//         const iv = setInterval(() => {
//             setTimer(prev => {
//                 if (prev <= 1) { generate(); return 15; }
//                 return prev - 1;
//             });
//         }, 1000);
//         return () => clearInterval(iv);
//     }, [session]);

//     /* Live scans listener */
//     useEffect(() => {
//         const q = query(
//             collection(db, 'live_attendance_scans'),
//             where('cohortId', '==', session.cohortId),
//             where('dateString', '==', todayString),
//         );
//         const unsub = onSnapshot(q, snap => {
//             const scans = snap.docs.map(d => ({ id: d.id, ...d.data() }));
//             scans.sort((a: any, b: any) => b.scannedAt - a.scannedAt);
//             setLiveScans(scans);
//         });
//         return unsub;
//     }, [session, todayString]);

//     const isUrgent = timer <= 5;

//     return (
//         <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: '100vh', background: MIDNIGHT, position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>

//             {/* Header */}
//             <div style={{
//                 display: 'flex', alignItems: 'center', justifyContent: 'space-between',
//                 padding: '18px 32px', borderBottom: '1px solid rgba(255,255,255,0.06)',
//                 // background: 'rgba(0,0,0,0.15)',
//             }}>
//                 <div>
//                     <div style={{ display: 'flex', alignItems: 'baseline' }}>
//                         <span style={{ fontSize: 24, fontWeight: 800, color: GREEN, letterSpacing: -0.5 }}>m</span>
//                         <span style={{ fontSize: 24, fontWeight: 800, color: '#fff', letterSpacing: -0.5 }}>lab</span>
//                     </div>
//                     <div style={{ fontSize: 11, fontWeight: 500, color: 'rgba(255,255,255,0.38)', letterSpacing: '0.18em', textTransform: 'uppercase', marginTop: 2 }}>
//                         {session.cohortName}
//                     </div>
//                 </div>

//                 {/* Live status pill */}
//                 <div style={{
//                     display: 'flex', alignItems: 'center', gap: 8,
//                     background: 'rgba(148,199,61,0.1)',
//                     border: '1px solid rgba(148,199,61,0.25)',
//                     borderRadius: 20, padding: '8px 16px',
//                 }}>
//                     <div style={{
//                         width: 8, height: 8, borderRadius: '50%', background: GREEN,
//                         animation: 'none', // handled by CSS in KioskPage.css
//                     }} />
//                     <span style={{ fontSize: 11, fontWeight: 600, color: GREEN, letterSpacing: '0.14em', textTransform: 'uppercase' }}>
//                         Secure Register Active
//                     </span>
//                 </div>
//             </div>

//             {/* Body */}
//             <div style={{ display: 'flex', flex: 1 }}>

//                 {/* QR Panel */}
//                 <div style={{
//                     flex: 1.2, display: 'flex', flexDirection: 'column',
//                     alignItems: 'center', justifyContent: 'center', padding: '48px 40px',
//                     borderRight: '1px solid rgba(255,255,255,0.06)',
//                 }}>
//                     {/* QR frame */}
//                     <div style={{
//                         // background: '#fff', borderRadius: 20, padding: 20,
//                         marginBottom: 28,
//                         transition: 'background .25s',
//                         background: isUrgent ? 'rgba(220,38,38,0.08)' : '#fff',
//                     }}>
//                         {qrData && (
//                             <QRCodeSVG
//                                 value={qrData}
//                                 size={380}
//                                 level="H"
//                                 includeMargin={false}
//                                 fgColor={MIDNIGHT}
//                             />
//                         )}
//                     </div>

//                     <h2 style={{ fontFamily: 'system-ui', fontSize: 16, fontWeight: 600, color: 'rgba(255,255,255,0.55)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 20, textAlign: 'center' }}>
//                         Scan with the CodeTribe App
//                     </h2>

//                     {/* Timer */}
//                     <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
//                         <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={isUrgent ? '#dc2626' : 'rgba(255,255,255,0.45)'} strokeWidth="1.8" strokeLinecap="round">
//                             <circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 3" />
//                         </svg>
//                         <span style={{ fontSize: 22, fontWeight: 700, color: isUrgent ? '#dc2626' : '#fff', minWidth: 32, textAlign: 'center' }}>{timer}</span>
//                         <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', fontWeight: 300 }}>seconds until refresh</span>
//                     </div>

//                     {/* Progress bar */}
//                     <div style={{ width: '100%', maxWidth: 280, height: 4, background: 'rgba(255,255,255,0.08)', borderRadius: 2, overflow: 'hidden' }}>
//                         <div style={{
//                             height: '100%', borderRadius: 2,
//                             background: isUrgent ? '#dc2626' : GREEN,
//                             width: `${(timer / 15) * 100}%`,
//                             transition: 'width 1s linear, background .3s',
//                         }} />
//                     </div>
//                 </div>

//                 {/* Roster Panel */}
//                 <div style={{ width: 280, display: 'flex', flexDirection: 'column', padding: '24px 20px' }}>
//                     <div style={{
//                         display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16,
//                         paddingBottom: 14, borderBottom: '1px solid rgba(255,255,255,0.06)',
//                     }}>
//                         <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="1.8" strokeLinecap="round">
//                             <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" />
//                             <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
//                         </svg>
//                         <span style={{ fontFamily: 'system-ui', fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.45)', letterSpacing: '0.16em', textTransform: 'uppercase', flex: 1 }}>
//                             Live Check-ins
//                         </span>
//                         <span style={{
//                             fontFamily: 'system-ui', fontSize: 12, fontWeight: 700, color: GREEN,
//                             background: 'rgba(148,199,61,0.14)', border: '1px solid rgba(148,199,61,0.25)',
//                             borderRadius: 10, padding: '2px 10px',
//                         }}>
//                             {liveScans.length}
//                         </span>
//                     </div>

//                     <div style={{ display: 'flex', flexDirection: 'column', gap: 7, overflowY: 'auto', flex: 1 }}>
//                         {liveScans.length === 0 ? (
//                             <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, opacity: .3, paddingTop: 32, gap: 10 }}>
//                                 <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.4" strokeLinecap="round">
//                                     <rect x="2" y="3" width="20" height="14" rx="3" /><path d="M8 21h8M12 17v4" />
//                                 </svg>
//                                 <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', textAlign: 'center', fontWeight: 300 }}>
//                                     Awaiting first scan…
//                                 </p>
//                             </div>
//                         ) : (
//                             liveScans.map((scan: any, idx) => (
//                                 <div
//                                     key={scan.id}
//                                     style={{
//                                         display: 'flex', alignItems: 'center', gap: 10,
//                                         background: 'rgba(255,255,255,0.04)',
//                                         border: '1px solid rgba(255,255,255,0.06)',
//                                         borderRadius: 10, padding: '10px 12px',
//                                         animation: 'slideInRight .3s ease both',
//                                         animationDelay: `${idx * 0.04}s`,
//                                     }}
//                                 >
//                                     <div style={{
//                                         width: 24, height: 24, borderRadius: 7, flexShrink: 0,
//                                         background: 'rgba(148,199,61,0.14)',
//                                         border: '1px solid rgba(148,199,61,0.28)',
//                                         display: 'flex', alignItems: 'center', justifyContent: 'center',
//                                     }}>
//                                         <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke={GREEN} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
//                                             <polyline points="2,6 5,9 10,3" />
//                                         </svg>
//                                     </div>
//                                     <div>
//                                         <div style={{ fontSize: 13, fontWeight: 600, color: '#fff', lineHeight: 1.2 }}>{scan.learnerName}</div>
//                                         <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', fontWeight: 300, marginTop: 2 }}>
//                                             {moment(scan.scannedAt).format('HH:mm:ss')}
//                                         </div>
//                                     </div>
//                                 </div>
//                             ))
//                         )}
//                     </div>
//                 </div>

//             </div>
//         </div>
//     );
// }

// // ─── Root ─────────────────────────────────────────────────────────────────────
// export const KioskPage: React.FC = () => {
//     const [activeSession, setActiveSession] = useState<KioskSession | null>(null);

//     return activeSession
//         ? <ActiveKioskView session={activeSession} />
//         : <GatekeeperView onSuccess={setActiveSession} />;
// };