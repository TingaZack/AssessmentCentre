// src/pages/KioskPage/KioskPage.tsx

import React, { useEffect, useRef, useState } from 'react';
import { collection, query, where, getDocs, doc, getDoc, onSnapshot } from 'firebase/firestore';
import { QRCodeSVG } from 'qrcode.react';
import { db } from '../../lib/firebase';
import { ShieldAlert, Home, Coffee, Info, Loader2, Calendar, CheckCircle } from 'lucide-react';
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
    date: string;
}

// ─── Animations Injection ────────────────────────────────────────────────────
const BubbleStyles = () => (
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
        `}
    </style>
);

// ─── CAMPUS CLOSED VIEW ──────────────────────────────────────────────────────
function CampusClosedView({ reason, onBypass }: { reason: string; onBypass?: () => void }) {
    return (
        <div style={{
            flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            minHeight: '100vh', background: MIDNIGHT, color: '#fff', textAlign: 'center', padding: 24,
            position: "absolute", top: 0, left: 0, right: 0, bottom: 0
        }}>
            <div style={{ marginBottom: 24, padding: 32, borderRadius: '50%', background: 'rgba(255,255,255,0.05)', animation: 'popBubble 0.8s ease both' }}>
                {reason.includes('Weekend') ? <Home size={64} color={GREEN} /> : <Coffee size={64} color={GREEN} />}
            </div>
            <h1 style={{ fontFamily: 'system-ui', fontSize: 32, fontWeight: 700, marginBottom: 12, letterSpacing: '-0.02em' }}>
                Campus is Currently Closed
            </h1>
            <p style={{ fontSize: 18, color: 'rgba(255,255,255,0.6)', maxWidth: 450, lineHeight: 1.6, marginBottom: 40 }}>
                Attendance tracking is disabled for today.<br />
                <span style={{ color: GREEN, fontWeight: 600 }}>Reason: {reason}</span>
            </p>

            {onBypass && (
                <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: 30 }}>
                    <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', marginBottom: 15, letterSpacing: '0.05em' }}>FACILITATOR EMERGENCY OVERRIDE</p>
                    <button
                        onClick={onBypass}
                        style={{ border: '1px solid rgba(255,255,255,0.2)', color: '#fff', background: 'transparent', padding: '10px 20px', borderRadius: '8px', cursor: 'pointer', transition: 'background 0.2s' }}
                        onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
                        onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                    >
                        Activate Weekend/Emergency Session
                    </button>
                </div>
            )}
        </div>
    );
}

// ─── TIME PILL ───────────────────────────────────────────────────────────────
function TimePill({ label, time, color }: { label: string; time: number | undefined; color: string }) {
    if (!time) {
        return (
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.2)', border: '1px dashed rgba(255,255,255,0.15)', padding: '3px 6px', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1 }}>
                {label}
            </div>
        );
    }

    const isRecent = Date.now() - time < 15000;

    return (
        <div style={{
            fontSize: 10, fontWeight: 700, color: '#fff', backgroundColor: color,
            padding: '3px 6px', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, flex: 1,
            animation: isRecent ? 'popBubble 0.6s cubic-bezier(0.175, 0.885, 0.32, 1.275) both' : 'none',
            boxShadow: isRecent ? `0 0 12px ${color}80` : 'none',
            transition: 'box-shadow 1s ease-out'
        }}>
            <span>{label}</span>
            <span style={{ opacity: 0.8, fontWeight: 500 }}>{moment(time).format('HH:mm')}</span>
        </div>
    );
}

// ─── PIN BOX ─────────────────────────────────────────────────────────────────
function PinBox({ char, isFilled, isActive }: { char: string; isFilled: boolean; isActive: boolean }) {
    return (
        <div style={{
            width: 46, height: 58, borderRadius: 10,
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

// ─── GATEKEEPER VIEW ─────────────────────────────────────────────────────────
function GatekeeperView({ onSuccess, bypassClosure }: { onSuccess: (session: KioskSession) => void; bypassClosure: boolean }) {
    const [pin, setPin] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [closureReason, setClosureReason] = useState<string | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (pin.length !== 6) return;
        setLoading(true);
        setError(null);
        try {
            // Fetch the session strictly by PIN and Active Status
            const q = query(
                collection(db, 'kiosk_sessions'),
                where('pin', '==', pin),
                where('status', '==', 'active')
            );
            const snap = await getDocs(q);

            if (snap.empty) {
                setError('Invalid or inactive PIN.');
                setPin('');
            } else {
                const sessionData = snap.docs[0].data();
                const sessionDateAssigned = sessionData.date;

                const cohortSnap = await getDoc(doc(db, 'cohorts', sessionData.cohortId));
                const cohortData = cohortSnap.exists() ? cohortSnap.data() : {};

                // Verify Cohort-Specific Recess
                const recess = (cohortData.recessPeriods || []).find((p: any) => moment().isBetween(p.start, p.end, 'day', '[]'));

                if (recess && !bypassClosure) {
                    setClosureReason(`Scheduled Recess: ${recess.reason}`);
                } else {
                    onSuccess({
                        id: snap.docs[0].id,
                        cohortId: sessionData.cohortId,
                        cohortName: sessionData.cohortName || 'CodeTribe Class',
                        pin: sessionData.pin,
                        facilitatorId: sessionData.facilitatorId,
                        date: sessionDateAssigned
                    });
                }
            }
        } catch {
            setError('Network connection error. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    if (closureReason) return <CampusClosedView reason={closureReason} onBypass={() => setClosureReason(null)} />;

    return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: MIDNIGHT, position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, overflow: 'hidden' }}>
            <BubbleStyles />

            {/* Decorative orbs */}
            <div style={{ position: 'absolute', top: -80, right: -80, width: 260, height: 260, borderRadius: '50%', background: GREEN, opacity: .06, pointerEvents: 'none' }} />
            <div style={{ position: 'absolute', bottom: -60, left: -60, width: 200, height: 200, borderRadius: '50%', background: GREEN, opacity: .04, pointerEvents: 'none' }} />

            <div style={{ width: 72, height: 72, borderRadius: 20, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 24 }}>
                <ShieldAlert size={32} color={GREEN} />
            </div>

            <h1 style={{ fontFamily: 'system-ui', fontSize: 26, fontWeight: 700, color: '#fff', letterSpacing: '.04em', textTransform: 'uppercase', textAlign: 'center', marginBottom: 10 }}>Hub Kiosk Activation</h1>
            <p style={{ fontSize: 14, fontWeight: 300, color: 'rgba(255,255,255,0.5)', textAlign: 'center', lineHeight: 1.65, maxWidth: 340, marginBottom: 32 }}>Enter the 6-digit PIN emailed to the facilitator to project today's attendance code.</p>

            <form onSubmit={handleSubmit} style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 18, padding: 28, width: '100%', maxWidth: 360 }}>
                <span style={{ fontFamily: 'system-ui', fontSize: 10, fontWeight: 600, letterSpacing: '.18em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)', marginBottom: 12, display: 'block' }}>Session PIN</span>

                <div style={{ display: 'flex', gap: 8, marginBottom: 20, justifyContent: 'center', cursor: 'text' }} onClick={() => inputRef.current?.focus()}>
                    {[0, 1, 2, 3, 4, 5].map(i => <PinBox key={i} char={pin[i] || ''} isFilled={i < pin.length} isActive={i === pin.length} />)}
                    <input ref={inputRef} type="tel" inputMode="numeric" maxLength={6} value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))} autoFocus style={{ position: 'absolute', opacity: 0, width: 1, height: 1 }} />
                </div>

                {error && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(220,38,38,0.12)', border: '1px solid rgba(220,38,38,0.25)', borderRadius: 8, padding: '10px 14px', marginBottom: 18, fontSize: 13, color: '#fca5a5' }}>
                        <Info size={15} />
                        {error}
                    </div>
                )}

                <button type="submit" disabled={loading || pin.length !== 6} style={{ width: '100%', height: 50, background: pin.length === 6 ? GREEN : 'rgba(148,199,61,0.3)', border: 'none', borderRadius: 12, fontFamily: 'system-ui', fontSize: 13, fontWeight: 700, letterSpacing: '.16em', textTransform: 'uppercase', color: MIDNIGHT, cursor: pin.length === 6 ? 'pointer' : 'default', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, transition: 'opacity .2s', opacity: loading ? 0.7 : 1 }}>
                    {loading ? 'Verifying...' : 'Activate Kiosk'}
                </button>
            </form>
        </div>
    );
}

// ─── ACTIVE KIOSK VIEW ───────────────────────────────────────────────────────
function ActiveKioskView({ session }: { session: KioskSession }) {
    const [qrData, setQrData] = useState('');
    const [timer, setTimer] = useState(15);
    const [liveScans, setLiveScans] = useState<any[]>([]);

    const [isSessionClosed, setIsSessionClosed] = useState(false);
    const [verifyingStatus, setVerifyingStatus] = useState(true);

    const displayDate = moment(session.date).format("dddd, D MMMM YYYY");

    // 1. THE KILL SWITCH: Monitor Session Status in Real-Time
    useEffect(() => {
        let unsubscribe: () => void;

        const handleClosure = () => {
            setIsSessionClosed(true);
            setVerifyingStatus(false);
            // 🚀 STRIP URL PARAMS SO A REFRESH DOESN'T AUTO-LOGIN
            if (window.history.replaceState) {
                const cleanUrl = window.location.protocol + "//" + window.location.host + window.location.pathname;
                window.history.replaceState({ path: cleanUrl }, '', cleanUrl);
            }
        };

        const monitorStatus = (docId: string) => {
            return onSnapshot(doc(db, 'kiosk_sessions', docId), (snap) => {
                if (snap.exists()) {
                    const data = snap.data();
                    if (data.status === 'completed') {
                        handleClosure();
                    } else {
                        setIsSessionClosed(false);
                    }
                }
                setVerifyingStatus(false);
            });
        };

        if (session.id && session.id !== 'auto') {
            unsubscribe = monitorStatus(session.id);
        } else {
            // Logic for 'auto' sessions (URL bypass)
            const q = query(
                collection(db, 'kiosk_sessions'),
                where('cohortId', '==', session.cohortId),
                where('date', '==', session.date)
            );

            getDocs(q).then(snap => {
                if (!snap.empty) {
                    const docId = snap.docs[0].id;
                    const status = snap.docs[0].data().status;
                    if (status === 'completed') {
                        handleClosure();
                    } else {
                        unsubscribe = monitorStatus(docId);
                    }
                } else {
                    setVerifyingStatus(false);
                }
            });
        }

        return () => { if (unsubscribe) unsubscribe(); };
    }, [session]);

    // 2. 🕒 QR GENERATOR: Only refreshes if status is verified as OPEN
    useEffect(() => {
        if (verifyingStatus || isSessionClosed) return;

        const generate = () => {
            const params = new URLSearchParams({
                c: session.cohortId,
                f: session.facilitatorId,
                t: Date.now().toString()
            });
            const APP_URL = 'https://mlabassessmentcenter.web.app';
            setQrData(`${APP_URL}/app-scanner-required?${params.toString()}`);
            setTimer(15);
        };

        generate();
        const iv = setInterval(() => {
            setTimer(t => (t <= 1 ? (generate(), 15) : t - 1));
        }, 1000);

        return () => clearInterval(iv);
    }, [session, isSessionClosed, verifyingStatus]);

    // 3. 👥 LIVE BOARD: Stream incoming scans
    useEffect(() => {
        if (verifyingStatus || isSessionClosed) return;

        const q = query(
            collection(db, 'live_attendance_scans'),
            where('cohortId', '==', session.cohortId),
            where('dateString', '==', session.date)
        );

        return onSnapshot(q, snap => {
            const scans = snap.docs.map(d => {
                const data = d.data();
                const latestTime = Math.max(
                    data.checkOutAt || 0,
                    data.lunchInAt || 0,
                    data.lunchOutAt || 0,
                    data.checkInAt || data.scannedAt || 0
                );
                return { id: d.id, ...data, latestTime };
            });
            scans.sort((a: any, b: any) => b.latestTime - a.latestTime);
            setLiveScans(scans);
        });
    }, [session, verifyingStatus, isSessionClosed]);


    // ─── RENDER A: INITIAL STATUS VERIFICATION (The "Stall") ───
    if (verifyingStatus) {
        return (
            <div style={{ flex: 1, display: 'flex', position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: MIDNIGHT, minHeight: '100vh', alignItems: 'center', justifyContent: 'center' }}>
                <Loader2 className="lfm-spin" color={GREEN} size={48} />
            </div>
        );
    }

    // ─── RENDER B: SESSION CONCLUDED STATE (Terminal State) ───
    if (isSessionClosed) {
        return (
            <div style={{
                flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                minHeight: '100vh', background: MIDNIGHT, position: "absolute", top: 0, left: 0, right: 0, bottom: 0, zIndex: 1000
            }}>
                <BubbleStyles />
                <div style={{
                    marginBottom: 24, padding: 40, borderRadius: '50%',
                    background: 'rgba(148,199,61,0.1)', border: `2px solid ${GREEN}`,
                    animation: 'popBubble 0.8s ease both'
                }}>
                    <CheckCircle size={80} color={GREEN} />
                </div>
                <h1 style={{ fontFamily: 'system-ui', fontSize: 36, fontWeight: 800, color: '#fff', marginBottom: 16 }}>
                    Session Finalized
                </h1>
                <p style={{ fontSize: 18, color: 'rgba(255,255,255,0.6)', maxWidth: 500, textAlign: 'center', lineHeight: 1.6, marginBottom: 10 }}>
                    The attendance register for <strong>{displayDate}</strong> has been successfully closed.
                </p>
                <div style={{ fontSize: 13, background: 'rgba(255,255,255,0.05)', padding: '10px 20px', borderRadius: 8, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                    Kiosk Terminated for the Day
                </div>
            </div>
        );
    }

    // ─── RENDER C: ACTIVE SCANNING STATE ───
    return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: '100vh', background: MIDNIGHT, position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
            <BubbleStyles />

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 32px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                <div>
                    <img src={mLogo} alt="Logo" height={40} />
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 4 }}>
                        <div style={{ fontSize: 11, fontWeight: 500, color: '#fff', letterSpacing: '0.15em', textTransform: 'uppercase' }}>
                            {session.cohortName}
                        </div>
                        <div style={{ fontSize: 10, fontWeight: 400, color: 'rgba(255,255,255,0.4)', background: 'rgba(255,255,255,0.1)', padding: '2px 8px', borderRadius: 4 }}>
                            {displayDate}
                        </div>
                    </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(148,199,61,0.1)', border: '1px solid rgba(148,199,61,0.25)', padding: '8px 16px', borderRadius: 20 }}>
                    <div style={{ width: 8, height: 8, background: GREEN, borderRadius: '50%' }} />
                    <span style={{ color: GREEN, fontWeight: 600, fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase' }}>Secure Register Active</span>
                </div>
            </div>

            <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
                <div style={{ flex: 1.1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '48px 40px', borderRight: '1px solid rgba(255,255,255,0.06)' }}>
                    <div style={{ marginBottom: 28, transition: 'background .25s', background: timer <= 5 ? 'rgba(220,38,38,0.08)' : '#fff', padding: 10 }}>
                        {qrData && <QRCodeSVG value={qrData} size={380} level="M" includeMargin={true} fgColor="#000000" bgColor="#ffffff" />}
                    </div>
                    <h2 style={{ fontFamily: 'system-ui', fontSize: 16, fontWeight: 600, color: 'rgba(255,255,255,0.55)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 20, textAlign: 'center' }}>
                        Scan with the CodeTribe App
                    </h2>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                        <Calendar size={16} color={timer <= 5 ? '#dc2626' : 'rgba(255,255,255,0.45)'} />
                        <span style={{ fontSize: 22, fontWeight: 700, color: timer <= 5 ? '#dc2626' : '#fff', minWidth: 32, textAlign: 'center' }}>{timer}</span>
                        <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', fontWeight: 300 }}>seconds until refresh</span>
                    </div>
                    <div style={{ width: '100%', maxWidth: 280, height: 4, background: 'rgba(255,255,255,0.08)', borderRadius: 2, overflow: 'hidden' }}>
                        <div style={{ height: '100%', borderRadius: 2, background: timer <= 5 ? '#dc2626' : GREEN, width: `${(timer / 15) * 100}%`, transition: 'width 1s linear, background .3s' }} />
                    </div>
                </div>

                <div style={{ width: 440, display: 'flex', flexDirection: 'column', padding: '24px 20px', background: 'rgba(0,0,0,0.1)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, paddingBottom: 14, borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="1.8" strokeLinecap="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" /></svg>
                        <span style={{ fontFamily: 'system-ui', fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.45)', letterSpacing: '0.16em', textTransform: 'uppercase', flex: 1 }}>Live Timesheet Board</span>
                        <span style={{ fontFamily: 'system-ui', fontSize: 12, fontWeight: 700, color: GREEN, background: 'rgba(148,199,61,0.14)', border: '1px solid rgba(148,199,61,0.25)', borderRadius: 10, padding: '2px 10px' }}>{liveScans.length} Check-ins</span>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, overflowY: 'auto', flex: 1, paddingRight: 4 }}>
                        {liveScans.length === 0 ? (
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, opacity: .3, gap: 10 }}>
                                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.4" strokeLinecap="round"><rect x="2" y="3" width="20" height="14" rx="3" /><path d="M8 21h8M12 17v4" /></svg>
                                <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', textAlign: 'center', fontWeight: 300 }}>Awaiting first scan…</p>
                            </div>
                        ) : (
                            liveScans.map((s: any, idx: number) => (
                                <div key={s.id} style={{ display: 'flex', flexDirection: 'column', gap: 8, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: '12px 14px', animation: 'slideInRight .3s ease both', animationDelay: `${idx * 0.04}s` }}>
                                    <div style={{ fontSize: 14, fontWeight: 600, color: '#fff', letterSpacing: '0.02em' }}>
                                        {(() => {
                                            if (!s?.learnerName) return 'Unknown Learner';
                                            const names = s.learnerName.split(' ');
                                            return names.length > 1 ? `${names[0]} ${names[names.length - 1].charAt(0)}.` : s.learnerName;
                                        })()}
                                    </div>
                                    <div style={{ display: 'flex', gap: 6, width: '100%' }}>
                                        <TimePill label="IN" time={s.checkInAt || s.scannedAt} color="#3b82f6" />
                                        <TimePill label="L-OUT" time={s.lunchOutAt} color="#f59e0b" />
                                        <TimePill label="L-IN" time={s.lunchInAt} color="#8b5cf6" />
                                        <TimePill label="OUT" time={s.checkOutAt} color={GREEN} />
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

// ─── ROOT KIOSK PAGE ─────────────────────────────────────────────────────────
export const KioskPage: React.FC = () => {
    const [activeSession, setActiveSession] = useState<KioskSession | null>(null);
    const [holidays, setHolidays] = useState<string[]>([]);
    const [loading, setLoading] = useState(true);
    const [bypassClosure, setBypassClosure] = useState(false);
    const [initialCheckDone, setInitialCheckDone] = useState(false);

    useEffect(() => {
        const initKiosk = async () => {
            const params = new URLSearchParams(window.location.search);
            if (params.get('override') === 'true') setBypassClosure(true);

            const authParam = params.get('auth');
            if (authParam) {
                try {
                    const decoded = JSON.parse(atob(authParam));
                    setActiveSession({
                        id: 'auto',
                        cohortId: decoded.cid,
                        cohortName: 'CodeTribe',
                        pin: 'AUTO',
                        facilitatorId: decoded.fid,
                        date: moment().format('YYYY-MM-DD')
                    });
                } catch (e) { console.error("Auth error"); }
            }

            const currentYear = new Date().getFullYear();
            const cacheKey = `holidays_za_${currentYear}`;
            const cached = localStorage.getItem(cacheKey);

            if (cached) {
                setHolidays(JSON.parse(cached));
            } else {
                try {
                    const res = await fetch(`https://date.nager.at/api/v3/PublicHolidays/${currentYear}/ZA`);
                    if (res.ok) {
                        const data = await res.json();
                        const dateList = data.map((h: any) => h.date);
                        setHolidays(dateList);
                        localStorage.setItem(cacheKey, JSON.stringify(dateList));
                    }
                } catch (e) {
                    console.warn("Holiday API unreachable, bypassing holiday lock.");
                }
            }
            setLoading(false);
            setInitialCheckDone(true);
        };
        initKiosk();
    }, []);

    if (loading) {
        return (
            <div style={{ minHeight: '100vh', position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: MIDNIGHT, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Loader2 className="lfm-spin" color={GREEN} size={48} />
            </div>
        );
    }

    const today = moment().format('YYYY-MM-DD');
    const isWeekend = moment().day() === 0 || moment().day() === 6;
    const isHoliday = holidays.includes(today);

    if (initialCheckDone && !bypassClosure && (isWeekend || isHoliday)) {
        return <CampusClosedView
            reason={isHoliday ? "National Public Holiday" : "Standard Weekend Closure"}
            onBypass={() => setBypassClosure(true)}
        />;
    }

    return activeSession
        ? <ActiveKioskView session={activeSession} />
        : <GatekeeperView onSuccess={setActiveSession} bypassClosure={bypassClosure} />;
};
