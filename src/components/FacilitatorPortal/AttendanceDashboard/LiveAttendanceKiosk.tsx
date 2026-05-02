// src/components/FacilitatorPortal/AttendanceDashboard/LiveAttendanceKiosk.tsx

import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, where, onSnapshot, addDoc, serverTimestamp, getDocs } from 'firebase/firestore';
import { QRCodeSVG } from 'qrcode.react'; // 🚀 The QR Generator
import {
    Users, QrCode, MonitorStop, Play, Search, UserCheck,
    CheckCircle, ShieldCheck, Clock, X, Save
} from 'lucide-react';
import { db } from '../../../lib/firebase';
import { useStore } from '../../../store/useStore';
import { useNavigate, useParams } from 'react-router-dom';
import moment from 'moment';

export const LiveAttendanceKiosk: React.FC = () => {
    const navigate = useNavigate();
    const { cohortId } = useParams();
    const { user, learners, enrollments } = useStore();

    // ─── STATE ───
    const [isSessionActive, setIsSessionActive] = useState(false);
    const [qrData, setQrData] = useState<string>('');
    const [timer, setTimer] = useState(15);
    const [liveScans, setLiveScans] = useState<any[]>([]);
    const [manualSearch, setManualSearch] = useState('');

    const todayString = moment().format('YYYY-MM-DD');

    // ─── COHORT DATA RESOLUTION ───
    // Get all learners enrolled in this specific cohort
    const cohortLearners = useMemo(() => {
        const enrolledIds = enrollments
            .filter(e => e.cohortId === cohortId && e.status !== 'dropped')
            .map(e => e.learnerId);

        return learners.filter(l => enrolledIds.includes(l.id));
    }, [learners, enrollments, cohortId]);

    // ─── 1. AUTOMATED KIOSK: THE 15-SECOND ROTATING QR CODE ───
    useEffect(() => {
        let interval: NodeJS.Timeout;

        if (isSessionActive) {
            // Function to generate a secure payload
            // 🚀 NEW URL WAY
            const generateSecureQR = () => {
                // We use URLSearchParams to safely encode the variables
                const params = new URLSearchParams({
                    c: cohortId || '',           // Cohort ID
                    f: user?.uid || '',          // Facilitator ID (Fixed TS Error)
                    t: Date.now().toString()     // Exact Millisecond Timestamp
                });

                // Dynamically grab the current domain so this works on localhost AND production
                const APP_URL = window.location.origin;

                // The QR Code is now a scannable web link!
                const fallbackUrl = `${APP_URL}/app-scanner-required?${params.toString()}`;

                setQrData(fallbackUrl);
                setTimer(15);
            };

            generateSecureQR(); // Fire immediately

            // Countdown timer & QR Refresher
            interval = setInterval(() => {
                setTimer((prev) => {
                    if (prev <= 1) {
                        generateSecureQR();
                        return 15;
                    }
                    return prev - 1;
                });
            }, 1000);
        } else {
            setQrData('');
            setTimer(15);
        }

        return () => clearInterval(interval);
    }, [isSessionActive, cohortId, user?.uid]);

    // ─── 2. REAL-TIME LISTENER: WATCH FOR SCANS ───
    useEffect(() => {
        if (!cohortId) return;

        // Listen to a temporary collection for today's live scans
        const q = query(
            collection(db, 'live_attendance_scans'),
            where('cohortId', '==', cohortId),
            where('dateString', '==', todayString)
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const scans = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            // Sort newest first based on timestamp
            scans.sort((a: any, b: any) => b.scannedAt - a.scannedAt);
            setLiveScans(scans);
        });

        return () => unsubscribe();
    }, [cohortId, todayString]);

    // ─── 3. MANUAL FALLBACK: CLOCK IN A LEARNER ───
    const handleManualClockIn = async (learnerId: string, learnerName: string) => {
        // Prevent double clock-in
        if (liveScans.some(scan => scan.learnerId === learnerId)) return;

        try {
            await addDoc(collection(db, 'live_attendance_scans'), {
                cohortId,
                learnerId,
                learnerName,
                dateString: todayString,
                scannedAt: Date.now(),
                method: 'manual', // Flagged as manual intervention
                facilitatorId: user?.uid
            });
            setManualSearch(''); // Clear search
        } catch (error) {
            console.error("Manual clock-in failed:", error);
            alert("Failed to clock in learner manually.");
        }
    };

    // ─── 4. FINALIZE REGISTER (SAVE TO PERMANENT HISTORY) ───
    const handleFinalizeRegister = async () => {
        if (!window.confirm("Are you sure you want to finalize today's attendance? This will lock the register.")) return;

        const presentIds = liveScans.map(s => s.learnerId);
        const absentIds = cohortLearners.filter(l => !presentIds.includes(l.id)).map(l => l.id);

        try {
            // Save to the official 'attendance' historical collection
            await addDoc(collection(db, 'attendance'), {
                cohortId,
                facilitatorId: user?.uid,
                date: todayString,
                presentLearners: presentIds,
                absentLearners: absentIds,
                proofs: {}, // Can attach manual proofs later
                createdAt: serverTimestamp()
            });

            alert("Register finalized and saved securely!");
            navigate(-1); // Go back to dashboard
        } catch (error) {
            console.error("Failed to save register:", error);
            alert("Error saving register.");
        }
    };

    const searchResults = manualSearch.trim() === ''
        ? []
        : cohortLearners.filter(l =>
            l.fullName.toLowerCase().includes(manualSearch.toLowerCase()) &&
            !liveScans.some(scan => scan.learnerId === l.id) // Hide already clocked-in learners
        );

    return (
        <div style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto', fontFamily: 'var(--font-body)' }}>

            {/* ── HEADER ── */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                <div>
                    <h1 style={{ fontFamily: 'var(--font-heading)', color: 'var(--mlab-blue)', margin: 0, textTransform: 'uppercase' }}>
                        Live Attendance Kiosk
                    </h1>
                    <p style={{ color: 'var(--mlab-grey)', margin: '4px 0 0 0' }}>
                        {moment().format('dddd, Do MMMM YYYY')}
                    </p>
                </div>

                <button
                    onClick={() => setIsSessionActive(!isSessionActive)}
                    style={{
                        display: 'flex', alignItems: 'center', gap: '8px',
                        padding: '12px 24px', borderRadius: '8px', border: 'none',
                        background: isSessionActive ? '#fef2f2' : 'var(--mlab-green)',
                        color: isSessionActive ? '#dc2626' : 'var(--mlab-blue)',
                        fontWeight: 'bold', cursor: 'pointer', fontFamily: 'var(--font-heading)', textTransform: 'uppercase'
                    }}
                >
                    {isSessionActive ? <MonitorStop size={18} /> : <Play size={18} />}
                    {isSessionActive ? 'Stop Kiosk Mode' : 'Start Kiosk Mode'}
                </button>
            </div>

            <div style={{ display: 'flex', gap: '2rem', alignItems: 'flex-start' }}>

                {/* ── LEFT: AUTOMATED QR KIOSK ── */}
                <div style={{ flex: 1, background: 'white', padding: '3rem', borderRadius: '16px', border: '2px solid var(--mlab-blue)', textAlign: 'center', boxShadow: '0 10px 25px rgba(0,0,0,0.05)' }}>
                    {isSessionActive ? (
                        <div className="animate-fade-in">
                            <div style={{ background: '#f0fdf4', color: '#166534', padding: '8px 16px', borderRadius: '20px', display: 'inline-flex', alignItems: 'center', gap: '8px', fontWeight: 'bold', marginBottom: '2rem' }}>
                                <ShieldCheck size={16} /> Secure Mode Active
                            </div>

                            <div style={{ border: '4px solid var(--mlab-blue)', padding: '1rem', display: 'inline-block', borderRadius: '16px', background: 'white', marginBottom: '2rem' }}>
                                <QRCodeSVG
                                    value={qrData}
                                    size={350}
                                    level="H"
                                    includeMargin={false}
                                    fgColor="var(--mlab-blue)"
                                />
                            </div>

                            <h2 style={{ fontFamily: 'var(--font-heading)', color: 'var(--mlab-blue)', margin: '0 0 10px 0', fontSize: '1.5rem' }}>
                                Scan to Clock In
                            </h2>

                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', color: timer <= 5 ? '#dc2626' : 'var(--mlab-grey)' }}>
                                <Clock size={16} />
                                <span style={{ fontWeight: 'bold', fontSize: '1.1rem' }}>
                                    Code refreshes in {timer}s
                                </span>
                            </div>

                            {/* Visual Progress Bar for Timer */}
                            <div style={{ width: '200px', height: '6px', background: '#e2e8f0', borderRadius: '3px', margin: '15px auto 0', overflow: 'hidden' }}>
                                <div style={{
                                    height: '100%',
                                    background: timer <= 5 ? '#dc2626' : 'var(--mlab-green)',
                                    width: `${(timer / 15) * 100}%`,
                                    transition: 'width 1s linear'
                                }} />
                            </div>
                        </div>
                    ) : (
                        <div style={{ padding: '4rem 0', color: 'var(--mlab-grey)' }}>
                            <QrCode size={80} style={{ opacity: 0.2, margin: '0 auto 1rem' }} />
                            <h2 style={{ fontFamily: 'var(--font-heading)', color: 'var(--mlab-blue)', textTransform: 'uppercase' }}>Kiosk is Offline</h2>
                            <p>Click "Start Kiosk Mode" to project the dynamic QR code for learners.</p>
                        </div>
                    )}
                </div>

                {/* ── RIGHT: MANUAL FALLBACK & LIVE LIST ── */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

                    {/* Manual Entry Panel */}
                    <div style={{ background: 'white', padding: '1.5rem', borderRadius: '12px', border: '1px solid var(--mlab-border)', boxShadow: '0 4px 6px rgba(0,0,0,0.02)' }}>
                        <h3 style={{ fontFamily: 'var(--font-heading)', color: 'var(--mlab-blue)', margin: '0 0 1rem 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <UserCheck size={16} /> Manual Intervention
                        </h3>
                        <div style={{ position: 'relative' }}>
                            <Search size={16} color="var(--mlab-grey)" style={{ position: 'absolute', left: '12px', top: '12px' }} />
                            <input
                                type="text"
                                placeholder="Search learner by name to manually clock in..."
                                value={manualSearch}
                                onChange={(e) => setManualSearch(e.target.value)}
                                style={{ width: '100%', padding: '10px 12px 10px 36px', border: '1px solid var(--mlab-border)', borderRadius: '6px', fontSize: '0.9rem' }}
                            />
                        </div>

                        {/* Manual Search Results */}
                        {searchResults.length > 0 && (
                            <div style={{ marginTop: '10px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', maxHeight: '150px', overflowY: 'auto' }}>
                                {searchResults.map(l => (
                                    <div key={l.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', borderBottom: '1px solid #e2e8f0' }}>
                                        <span style={{ fontSize: '0.9rem', fontWeight: 'bold', color: 'var(--mlab-blue)' }}>{l.fullName}</span>
                                        <button
                                            onClick={() => handleManualClockIn(l.id, l.fullName)}
                                            style={{ background: 'var(--mlab-blue)', color: 'white', border: 'none', padding: '4px 10px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 'bold', cursor: 'pointer' }}
                                        >
                                            Clock In
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Live Scans Panel */}
                    <div style={{ background: 'white', padding: '1.5rem', borderRadius: '12px', border: '1px solid var(--mlab-border)', flex: 1, display: 'flex', flexDirection: 'column', boxShadow: '0 4px 6px rgba(0,0,0,0.02)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                            <h3 style={{ fontFamily: 'var(--font-heading)', color: 'var(--mlab-blue)', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <Users size={16} /> Live Register
                            </h3>
                            <span style={{ background: 'var(--mlab-light-blue)', color: 'var(--mlab-blue)', padding: '4px 10px', borderRadius: '12px', fontSize: '0.8rem', fontWeight: 'bold' }}>
                                {liveScans.length} / {cohortLearners.length} Present
                            </span>
                        </div>

                        <div style={{ flex: 1, overflowY: 'auto', maxHeight: '400px' }}>
                            {liveScans.length === 0 ? (
                                <div style={{ textAlign: 'center', color: 'var(--mlab-grey)', padding: '2rem 0' }}>
                                    <Clock size={32} style={{ opacity: 0.3, margin: '0 auto 10px' }} />
                                    <p style={{ margin: 0 }}>Waiting for first scan...</p>
                                </div>
                            ) : (
                                liveScans.map(scan => (
                                    <div key={scan.id} className="animate-fade-in" style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px', borderBottom: '1px solid #f1f5f9' }}>
                                        <div style={{ background: '#dcfce7', color: '#166534', padding: '6px', borderRadius: '50%' }}>
                                            <CheckCircle size={16} />
                                        </div>
                                        <div style={{ flex: 1 }}>
                                            <div style={{ fontWeight: 'bold', color: 'var(--mlab-blue)', fontSize: '0.95rem' }}>{scan.learnerName}</div>
                                            <div style={{ fontSize: '0.75rem', color: 'var(--mlab-grey)' }}>
                                                {moment(scan.scannedAt).format('HH:mm:ss')} • {scan.method === 'manual' ? 'Manually Added' : 'Scanned Kiosk'}
                                            </div>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>

                        {/* Finalize Button */}
                        <button
                            onClick={handleFinalizeRegister}
                            disabled={liveScans.length === 0}
                            style={{
                                marginTop: '1.5rem', width: '100%', padding: '14px', borderRadius: '8px', border: 'none',
                                background: liveScans.length === 0 ? '#e2e8f0' : 'var(--mlab-blue)',
                                color: liveScans.length === 0 ? '#94a3b8' : 'white',
                                fontWeight: 'bold', cursor: liveScans.length === 0 ? 'not-allowed' : 'pointer',
                                fontFamily: 'var(--font-heading)', textTransform: 'uppercase', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px'
                            }}
                        >
                            <Save size={16} /> Finalize Register
                        </button>
                    </div>

                </div>
            </div>
        </div>
    );
};