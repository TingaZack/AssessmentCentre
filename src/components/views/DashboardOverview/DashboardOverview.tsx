// src/components/views/DashboardOverview/DashboardOverview.tsx

import React, { useMemo, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    LayoutDashboard, MapPin, Maximize, Minimize, BarChart2, Users
} from 'lucide-react';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer,
    PieChart, Pie, Cell, Legend
} from 'recharts';
import { collection, query, where, getDocs } from 'firebase/firestore';

// 🚀 MAP IMPORTS
import { MapContainer, TileLayer, CircleMarker, Tooltip as LeafletTooltip, ZoomControl } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

import { db } from '../../../lib/firebase';
import { useStore } from '../../../store/useStore';
import { ModuleProgressCard } from '../../common/ModuleProgressCard/ModuleProgressCard';
import './DashboardOverview.css';

// 🚀 COORDINATE DICTIONARY FOR SOUTH AFRICAN HUBS
const SA_LOCATIONS: Record<string, [number, number]> = {
    'Gauteng': [-26.2041, 28.0473],
    'Johannesburg': [-26.2041, 28.0473],
    'Pretoria': [-25.7479, 28.2293],
    'Soweto': [-26.2678, 27.8585],
    'Western Cape': [-33.9249, 18.4241],
    'Cape Town': [-33.9249, 18.4241],
    'KwaZulu-Natal': [-29.8587, 31.0218],
    'Durban': [-29.8587, 31.0218],
    'Pietermaritzburg': [-29.6006, 30.3794],
    'Limpopo': [-23.9045, 29.4688],
    'Polokwane': [-23.9045, 29.4688],
    'Mpumalanga': [-25.4753, 30.9853],
    'Mbombela': [-25.4753, 30.9853],
    'Nelspruit': [-25.4753, 30.9853],
    'Free State': [-29.1141, 26.2208],
    'Bloemfontein': [-29.1141, 26.2208],
    'North West': [-25.8640, 25.6442],
    'Mahikeng': [-25.8640, 25.6442],
    'Northern Cape': [-28.7282, 24.7630],
    'Kimberley': [-28.7282, 24.7630],
    'Eastern Cape': [-33.9608, 25.6022],
    'Gqeberha': [-33.9608, 25.6022],
    'Port Elizabeth': [-33.9608, 25.6022],
    'East London': [-33.9818, 25.6712]
};

export const DashboardOverview: React.FC = () => {
    // 1. Destructure fetch actions to guarantee data loads on direct navigation
    const { learners, cohorts, programmes, settings, fetchLearners, fetchCohorts, fetchProgrammes } = useStore();
    const navigate = useNavigate();

    const [totalSubmissions, setTotalSubmissions] = useState(0);
    const [pendingAppealsCount, setPendingAppealsCount] = useState(0);
    const [pendingGradingCount, setPendingGradingCount] = useState(0);
    const [liveClassesCount, setLiveClassesCount] = useState(0);

    const [isMapFullscreen, setIsMapFullscreen] = useState(false);

    // ─── INITIALIZE GLOBAL STORE DATA ───
    useEffect(() => {
        if (learners.length === 0 && fetchLearners) fetchLearners();
        if (cohorts.length === 0 && fetchCohorts) fetchCohorts();
        if (programmes.length === 0 && fetchProgrammes) fetchProgrammes();
    }, []);

    // ─── FETCH LIVE ACTIONABLE METRICS ───
    useEffect(() => {
        const fetchLiveMetrics = async () => {
            try {
                // 0. Fetch Total Submissions for an accurate denominator
                const subSnap = await getDocs(collection(db, 'learner_submissions'));
                setTotalSubmissions(subSnap.size);

                // 1. Fetch Appeals
                const appealsSnap = await getDocs(query(collection(db, 'learner_submissions'), where('status', '==', 'appealed')));
                setPendingAppealsCount(appealsSnap.size);

                // 2. Fetch Pending Grading (Assessments submitted but not yet graded)
                const gradingSnap = await getDocs(query(collection(db, 'learner_submissions'), where('status', '==', 'submitted')));
                setPendingGradingCount(gradingSnap.size);

                // 3. Fetch Live Kiosk Sessions for Today
                const todayStr = new Date().toISOString().split('T')[0];
                const liveSnap = await getDocs(query(
                    collection(db, 'kiosk_sessions'),
                    where('date', '==', todayStr),
                    where('status', '==', 'active')
                ));
                setLiveClassesCount(liveSnap.size);
            } catch (err) {
                console.error("Failed to fetch live admin metrics:", err);
            }
        };
        fetchLiveMetrics();
    }, []);

    // ─── CORE ACADEMIC KPIs ───
    const activeLearners = learners.filter(l => !l.isArchived);
    const totalEnrollments = activeLearners.length;
    const securedCertificates = activeLearners.filter(l => l.isBlockchainVerified).length;
    const eisaReadyCount = activeLearners.filter(l => l.eisaAdmission).length;

    // ─── SYSTEM THROUGHPUT ───
    const activeProgrammesCount = programmes.filter(p => !p.isArchived).length;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let upcomingCohorts = 0;
    let ongoingCohorts = 0;
    let concludedCohorts = 0;

    cohorts.filter(c => !c.isArchived).forEach(c => {
        const startDate = new Date(c.startDate);
        const endDate = new Date(c.endDate);
        if (startDate > today) upcomingCohorts++;
        else if (endDate < today) concludedCohorts++;
        else ongoingCohorts++;
    });

    const activeCampusIds = new Set(cohorts.filter(c => !c.isArchived).map(c => c.campusId).filter(Boolean));
    const activeCampusesCount = activeCampusIds.size;

    // ─── AT-RISK & QA INTELLIGENCE ───
    const atRiskLearnersCount = useMemo(() => {
        let count = 0;
        activeLearners.forEach(l => {
            if (l.eisaAdmission) return;
            let hasNYC = false;
            const checkNYC = (mod: any) => {
                const s = mod.status?.toLowerCase();
                if (s === 'not yet competent' || s === 'nyc' || s === 'fail') hasNYC = true;
            };
            l.knowledgeModules?.forEach(checkNYC);
            l.practicalModules?.forEach(checkNYC);
            l.workExperienceModules?.forEach(checkNYC);

            let isOverdue = false;
            if (l.trainingEndDate) {
                const parts = l.trainingEndDate.split('-');
                if (parts.length === 3) {
                    const isYearFirst = parts[0].length === 4;
                    const endDate = isYearFirst
                        ? new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]))
                        : new Date(Number(parts[2]), Number(parts[1]) - 1, Number(parts[0]));
                    if (endDate < today) isOverdue = true;
                }
            }
            if (hasNYC || isOverdue) count++;
        });
        return count;
    }, [activeLearners, today]);

    // ─── GEOGRAPHIC DATA AGGREGATION ───
    // Extract unique active humans to prevent multi-enrollments from skewing the map
    const uniqueActiveLearners = useMemo(() => {
        const map = new Map();
        activeLearners.forEach(l => {
            const id = l.learnerId || l.id;
            if (!map.has(id)) map.set(id, l);
        });
        return Array.from(map.values());
    }, [activeLearners]);

    const locationStats = useMemo(() => {
        const stats = new Map<string, { lat: number, lng: number, count: number, name: string }>();

        uniqueActiveLearners.forEach(l => {
            const prov = String(l.demographics?.province || (l as any).province || '').trim();
            const city = String(l.demographics?.city || l.demographics?.municipality || (l as any).city || '').trim();

            let matchName = SA_LOCATIONS[city] ? city : (SA_LOCATIONS[prov] ? prov : null);

            if (matchName) {
                if (!stats.has(matchName)) {
                    stats.set(matchName, { lat: SA_LOCATIONS[matchName][0], lng: SA_LOCATIONS[matchName][1], count: 0, name: matchName });
                }
                stats.get(matchName)!.count++;
            } else {
                // Fallback generic location for unknown SA addresses
                const other = 'Unknown/Other';
                if (!stats.has(other)) stats.set(other, { lat: -28.4793, lng: 24.6727, count: 0, name: other }); // Center SA
                stats.get(other)!.count++;
            }
        });

        return Array.from(stats.values()).sort((a, b) => b.count - a.count);
    }, [uniqueActiveLearners]);

    // ─── CHART DATA PREPARATION ───
    const assessmentData = useMemo(() => {
        const stats = {
            Knowledge: { Competent: 0, NYC: 0, InProgress: 0 },
            Practical: { Competent: 0, NYC: 0, InProgress: 0 },
            Workplace: { Competent: 0, NYC: 0, InProgress: 0 }
        };
        const categorize = (status: string, category: 'Knowledge' | 'Practical' | 'Workplace') => {
            const s = status?.toLowerCase() || '';
            if (s === 'competent' || s === 'c' || s === 'pass') stats[category].Competent += 1;
            else if (s === 'not yet competent' || s === 'nyc' || s === 'fail') stats[category].NYC += 1;
            else stats[category].InProgress += 1;
        };
        activeLearners.forEach(l => {
            l.knowledgeModules?.forEach(m => categorize(m.status, 'Knowledge'));
            l.practicalModules?.forEach(m => categorize(m.status, 'Practical'));
            l.workExperienceModules?.forEach(m => categorize(m.status, 'Workplace'));
        });
        return [
            { name: 'Knowledge', ...stats.Knowledge },
            { name: 'Practical', ...stats.Practical },
            { name: 'Workplace', ...stats.Workplace }
        ];
    }, [activeLearners]);

    const cohortLifecycleData = [
        { name: 'Ongoing Classes', value: ongoingCohorts, color: 'var(--mlab-blue)' },
        { name: 'Concluded Classes', value: concludedCohorts, color: 'var(--mlab-green)' },
        { name: 'Upcoming Classes', value: upcomingCohorts, color: '#8b5cf6' }
    ].filter(d => d.value > 0);

    const web3Data = [
        { name: 'Secured on Blockchain', value: securedCertificates, color: 'var(--mlab-green)' },
        { name: 'Pending Mint', value: totalEnrollments - securedCertificates, color: '#f59e0b' }
    ].filter(d => d.value > 0);

    const tooltipStyle = {
        borderRadius: '8px',
        border: '1px solid var(--mlab-border)',
        boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)',
        fontFamily: 'var(--font-body)',
        fontSize: '0.82rem',
    };

    return (
        <div className="wm-root animate-fade-in" style={{ paddingBottom: '2rem' }}>

            {/* ── PAGE HEADER ── */}
            <div className="wm-page-header">
                <div className="wm-page-header__left">
                    <div className="wm-page-header__icon"><LayoutDashboard size={22} /></div>
                    <div>
                        <h1 className="wm-page-header__title">System Overview</h1>
                        <p className="wm-page-header__desc">High-level insights into academic performance, enrollments, and real-time operations.</p>
                    </div>
                </div>
            </div>

            {/* ── ACTION REQUIRED (URGENT KPIs) ── */}
            <h3 style={{ fontSize: '0.9rem', color: 'var(--mlab-grey)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 1rem 4px' }}>Action & Operations</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
                <ModuleProgressCard
                    type="Pending Marking"
                    data={{ total: totalSubmissions > 0 ? totalSubmissions : 1, logged: pendingGradingCount }}
                // onClick={() => navigate('/admin?tab=assessments')}
                />
                <ModuleProgressCard
                    type="Active Appeals"
                    data={{ total: totalSubmissions > 0 ? totalSubmissions : 1, logged: pendingAppealsCount }}
                // onClick={() => navigate('/admin?tab=assessments')}
                />
                <ModuleProgressCard
                    type="Live Classes"
                    data={{ total: ongoingCohorts > 0 ? ongoingCohorts : 1, logged: liveClassesCount }}
                    onClick={() => navigate('/admin?tab=attendance')}
                />
            </div>

            {/* ── SYSTEM THROUGHPUT ── */}
            <h3 style={{ fontSize: '0.9rem', color: 'var(--mlab-grey)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 1rem 4px' }}>Capacity & Throughput</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
                <ModuleProgressCard
                    type="Active Qualifications"
                    data={{ total: programmes.length > 0 ? programmes.length : 1, logged: activeProgrammesCount }}
                />
                <ModuleProgressCard
                    type="Active Cohorts"
                    data={{ total: cohorts.length > 0 ? cohorts.length : 1, logged: ongoingCohorts }}
                />
                <ModuleProgressCard
                    type="Active Learners"
                    data={{ total: learners.length > 0 ? learners.length : 1, logged: totalEnrollments }}
                />
                <ModuleProgressCard
                    type="Active Campuses"
                    data={{ total: settings?.campuses?.length || activeCampusesCount || 1, logged: activeCampusesCount }}
                />
            </div>

            {/* ── ACADEMIC QA & BLOCKCHAIN ── */}
            <h3 style={{ fontSize: '0.9rem', color: 'var(--mlab-grey)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 1rem 4px' }}>Quality Assurance & Certification</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem', marginBottom: '2.5rem' }}>
                <ModuleProgressCard
                    type="EISA Readiness"
                    data={{ total: totalEnrollments > 0 ? totalEnrollments : 1, logged: eisaReadyCount }}
                />
                <ModuleProgressCard
                    type="At-Risk Analytics"
                    data={{ total: totalEnrollments > 0 ? totalEnrollments : 1, logged: atRiskLearnersCount }}
                />
                <ModuleProgressCard
                    type="Web3 Certificates"
                    data={{ total: totalEnrollments > 0 ? totalEnrollments : 1, logged: securedCertificates }}
                />
            </div>

            {/* ── MAP & DISTRIBUTION LIST ROW ── */}
            <h3 style={{ fontSize: '0.9rem', color: 'var(--mlab-grey)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 1rem 4px' }}>Geographic Distribution</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '1.5rem', marginBottom: '2.5rem' }}>

                {/* Left Side: Interactive Fullscreen Map */}
                <div style={isMapFullscreen ? {
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    zIndex: 999999, backgroundColor: 'var(--mlab-white)',
                    display: 'flex', flexDirection: 'column',
                    height: '400px'
                } : {
                    border: '2px solid var(--mlab-border)', borderRadius: 0,
                    display: 'flex', flexDirection: 'column'
                }}>

                    <div style={{ borderBottom: '1px solid var(--mlab-border)', background: 'var(--mlab-bg)', padding: isMapFullscreen ? '1rem 1.5rem' : '1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <MapPin size={isMapFullscreen ? 20 : 16} color="var(--mlab-blue)" />
                            <h2 style={{ margin: 0, fontFamily: 'var(--font-heading)', fontSize: isMapFullscreen ? '1.2rem' : '0.9rem', fontWeight: 700, color: 'var(--mlab-blue)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                Global Applicant Geo-Concentration {isMapFullscreen ? "(Full Screen View)" : ""}
                            </h2>
                        </div>

                        {isMapFullscreen && (
                            <button
                                onClick={() => setIsMapFullscreen(false)}
                                style={{
                                    background: 'var(--mlab-red)', color: 'white', border: 'none',
                                    padding: '8px 16px', cursor: 'pointer', display: 'flex',
                                    alignItems: 'center', gap: '8px', fontWeight: 700,
                                    fontFamily: 'var(--font-heading)', textTransform: 'uppercase',
                                    borderRadius: 0, boxShadow: '0 2px 8px rgba(239,68,68,0.3)'
                                }}
                            >
                                <Minimize size={16} /> Exit Full Screen
                            </button>
                        )}
                    </div>

                    <div style={{ height: isMapFullscreen ? '100%' : '350px', width: '100%', position: 'relative', flex: isMapFullscreen ? 1 : 'none' }}>

                        {/* Inline Maximize Button for standard view */}
                        {!isMapFullscreen && (
                            <button
                                onClick={() => setIsMapFullscreen(true)}
                                style={{
                                    position: 'absolute', top: '10px', right: '10px', zIndex: 1000,
                                    background: 'var(--mlab-white)', border: '2px solid var(--mlab-blue)',
                                    padding: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center',
                                    justifyContent: 'center', color: 'var(--mlab-blue)', borderRadius: 0
                                }}
                                title="View Full Screen"
                            >
                                <Maximize size={16} />
                            </button>
                        )}

                        <MapContainer
                            key={isMapFullscreen ? "fullscreen-dashboard-map" : "inline-dashboard-map"}
                            center={[-28.4793, 24.6727]}
                            zoom={isMapFullscreen ? 6 : 5}
                            style={{ height: '100%', width: '100%', zIndex: 1 }}
                            zoomControl={false}
                        >
                            <TileLayer
                                url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
                                attribution='&copy; <a href="https://carto.com/">CartoDB</a>'
                            />
                            {isMapFullscreen && <ZoomControl position="bottomleft" />}

                            {locationStats.map((loc, i) => (
                                <CircleMarker
                                    key={i}
                                    center={[loc.lat, loc.lng]}
                                    radius={Math.max(8, Math.min(30, loc.count * 1.5))}
                                    fillColor="var(--mlab-green)"
                                    color="var(--mlab-green-dark)"
                                    weight={1}
                                    opacity={0.8}
                                    fillOpacity={0.6}
                                >
                                    <LeafletTooltip>
                                        <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.8rem' }}>
                                            <strong>{loc.name}</strong><br />
                                            {loc.count} Profile{loc.count !== 1 ? 's' : ''}
                                        </div>
                                    </LeafletTooltip>
                                </CircleMarker>
                            ))}
                        </MapContainer>
                    </div>
                </div>

                {/* Right Side: Concentration List */}
                <div style={{
                    border: '2px solid var(--mlab-border)',
                    borderRadius: 0, backgroundColor: 'var(--mlab-white)', display: 'flex', flexDirection: 'column',
                    height: '400px'
                }}>
                    <div style={{
                        borderBottom: '1px solid var(--mlab-border)',
                        background: 'var(--mlab-bg)', padding: '1rem', display: 'flex', alignItems: 'center', gap: '8px'
                    }}>
                        <BarChart2 size={16} color="var(--mlab-blue)" />
                        <h2 style={{ margin: 0, fontFamily: 'var(--font-heading)', fontSize: '0.9rem', fontWeight: 700, color: 'var(--mlab-blue)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                            Top Active Hubs
                        </h2>
                    </div>
                    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '1rem 1.5rem', background: 'var(--mlab-white)', overflowY: 'auto' }}>
                        {locationStats.length > 0 ? locationStats.map((loc, idx) => {
                            const pct = uniqueActiveLearners.length > 0 ? Math.round((loc.count / uniqueActiveLearners.length) * 100) : 0;
                            return (
                                <div key={idx} style={{
                                    display: 'grid', gridTemplateColumns: '1fr', gap: '8px',
                                    padding: '10px 16px', background: 'var(--mlab-bg)',
                                    border: '1px solid var(--mlab-border)', borderLeft: '4px solid var(--mlab-green)'
                                }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--mlab-midnight)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                            <MapPin size={12} color="var(--mlab-green)" /> {loc.name}
                                        </span>
                                        <span style={{ fontSize: '0.75rem', color: 'var(--mlab-grey)', fontWeight: 600 }}>{loc.count} profiles ({pct}%)</span>
                                    </div>
                                    <div style={{ width: '100%', background: '#e2e8f0', height: '6px', overflow: 'hidden' }}>
                                        <div style={{ width: `${pct}%`, background: 'var(--mlab-green)', height: '100%', transition: 'width 0.5s ease' }} />
                                    </div>
                                </div>
                            );
                        }) : (
                            <div style={{ textAlign: 'center', padding: '1rem', color: 'var(--mlab-grey)', fontSize: '0.85rem', fontStyle: 'italic' }}>
                                No geographic data mapped yet.
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* ── CHARTS ── */}
            <h3 style={{ fontSize: '0.9rem', color: 'var(--mlab-grey)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 1rem 4px' }}>Performance Analytics</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(450px, 1fr))', gap: '1.5rem' }}>

                {/* Formative Assessment Health */}
                <div className="wm-card">
                    <div className="wm-card__header">
                        <h3 className="wm-card__name" style={{ fontSize: '0.9rem' }}>Formative Assessment Health</h3>
                    </div>
                    <div style={{ padding: '1rem 1.1rem', height: '320px' }}>
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={assessmentData} margin={{ top: 5, right: 30, left: -20, bottom: 5 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--mlab-border)" />
                                <XAxis dataKey="name" tick={{ fontSize: 12, fill: 'var(--mlab-grey)', fontFamily: 'var(--font-body)' }} axisLine={false} tickLine={false} />
                                <YAxis tick={{ fontSize: 12, fill: 'var(--mlab-grey)', fontFamily: 'var(--font-body)' }} axisLine={false} tickLine={false} />
                                <RechartsTooltip cursor={{ fill: 'var(--mlab-bg)' }} contentStyle={tooltipStyle} />
                                <Legend verticalAlign="top" height={36} iconType="circle" wrapperStyle={{ fontSize: '12px', fontFamily: 'var(--font-body)' }} />
                                <Bar dataKey="Competent" stackId="a" fill="var(--mlab-green)" radius={[0, 0, 4, 4]} />
                                <Bar dataKey="InProgress" stackId="a" fill="var(--mlab-blue)" name="In Progress" />
                                <Bar dataKey="NYC" stackId="a" fill="var(--mlab-red)" name="Not Yet Competent" radius={[4, 4, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Cohort Lifecycle */}
                <div className="wm-card">
                    <div className="wm-card__header">
                        <h3 className="wm-card__name" style={{ fontSize: '0.9rem' }}>Cohort Lifecycle</h3>
                    </div>
                    <div style={{ padding: '1rem 1.1rem', height: '320px' }}>
                        {cohortLifecycleData.length === 0 ? (
                            <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--mlab-grey-light)', fontStyle: 'italic', fontSize: '0.85rem' }}>
                                No active cohorts found.
                            </div>
                        ) : (
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie data={cohortLifecycleData} cx="50%" cy="45%" innerRadius={70} outerRadius={100} paddingAngle={2} dataKey="value">
                                        {cohortLifecycleData.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={entry.color} />
                                        ))}
                                    </Pie>
                                    <RechartsTooltip contentStyle={tooltipStyle} />
                                    <Legend verticalAlign="bottom" height={36} iconType="circle" wrapperStyle={{ fontFamily: 'var(--font-body)' }} />
                                </PieChart>
                            </ResponsiveContainer>
                        )}
                    </div>
                </div>

                {/* Certification Status */}
                <div className="wm-card">
                    <div className="wm-card__header">
                        <h3 className="wm-card__name" style={{ fontSize: '0.9rem' }}>Certification Status</h3>
                    </div>
                    <div style={{ padding: '1rem 1.1rem', height: '320px' }}>
                        {totalEnrollments === 0 ? (
                            <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--mlab-grey-light)', fontStyle: 'italic', fontSize: '0.85rem' }}>
                                No enrollments to certify yet.
                            </div>
                        ) : (
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie data={web3Data} cx="50%" cy="45%" innerRadius={70} outerRadius={100} paddingAngle={2} dataKey="value">
                                        {web3Data.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={entry.color} />
                                        ))}
                                    </Pie>
                                    <RechartsTooltip contentStyle={tooltipStyle} />
                                    <Legend verticalAlign="bottom" height={36} iconType="circle" wrapperStyle={{ fontFamily: 'var(--font-body)' }} />
                                </PieChart>
                            </ResponsiveContainer>
                        )}
                    </div>
                </div>

            </div>
        </div>
    );
};


// // src/components/views/DashboardOverview/DashboardOverview.tsx

// import React, { useMemo, useState, useEffect } from 'react';
// import { useNavigate } from 'react-router-dom';
// import { LayoutDashboard } from 'lucide-react';
// import {
//     BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer,
//     PieChart, Pie, Cell, Legend
// } from 'recharts';
// import { collection, query, where, getDocs } from 'firebase/firestore';
// import { db } from '../../../lib/firebase';
// import { useStore } from '../../../store/useStore';
// import { ModuleProgressCard } from '../../common/ModuleProgressCard/ModuleProgressCard';
// import './DashboardOverview.css';

// export const DashboardOverview: React.FC = () => {
//     // 1. Destructure fetch actions to guarantee data loads on direct navigation
//     const { learners, cohorts, programmes, settings, fetchLearners, fetchCohorts, fetchProgrammes } = useStore();
//     const navigate = useNavigate();

//     const [totalSubmissions, setTotalSubmissions] = useState(0);
//     const [pendingAppealsCount, setPendingAppealsCount] = useState(0);
//     const [pendingGradingCount, setPendingGradingCount] = useState(0);
//     const [liveClassesCount, setLiveClassesCount] = useState(0);

//     // ─── INITIALIZE GLOBAL STORE DATA ───
//     useEffect(() => {
//         if (learners.length === 0 && fetchLearners) fetchLearners();
//         if (cohorts.length === 0 && fetchCohorts) fetchCohorts();
//         if (programmes.length === 0 && fetchProgrammes) fetchProgrammes();
//     }, []);

//     // ─── FETCH LIVE ACTIONABLE METRICS ───
//     useEffect(() => {
//         const fetchLiveMetrics = async () => {
//             try {
//                 // 0. Fetch Total Submissions for an accurate denominator
//                 const subSnap = await getDocs(collection(db, 'learner_submissions'));
//                 setTotalSubmissions(subSnap.size);

//                 // 1. Fetch Appeals
//                 const appealsSnap = await getDocs(query(collection(db, 'learner_submissions'), where('status', '==', 'appealed')));
//                 setPendingAppealsCount(appealsSnap.size);

//                 // 2. Fetch Pending Grading (Assessments submitted but not yet graded)
//                 const gradingSnap = await getDocs(query(collection(db, 'learner_submissions'), where('status', '==', 'submitted')));
//                 setPendingGradingCount(gradingSnap.size);

//                 // 3. Fetch Live Kiosk Sessions for Today
//                 const todayStr = new Date().toISOString().split('T')[0];
//                 const liveSnap = await getDocs(query(
//                     collection(db, 'kiosk_sessions'),
//                     where('date', '==', todayStr),
//                     where('status', '==', 'active')
//                 ));
//                 setLiveClassesCount(liveSnap.size);
//             } catch (err) {
//                 console.error("Failed to fetch live admin metrics:", err);
//             }
//         };
//         fetchLiveMetrics();
//     }, []);

//     // ─── CORE ACADEMIC KPIs ───
//     const activeLearners = learners.filter(l => !l.isArchived);
//     const totalEnrollments = activeLearners.length;
//     const securedCertificates = activeLearners.filter(l => l.isBlockchainVerified).length;
//     const eisaReadyCount = activeLearners.filter(l => l.eisaAdmission).length;

//     // ─── SYSTEM THROUGHPUT ───
//     const activeProgrammesCount = programmes.filter(p => !p.isArchived).length;

//     const today = new Date();
//     today.setHours(0, 0, 0, 0);

//     let upcomingCohorts = 0;
//     let ongoingCohorts = 0;
//     let concludedCohorts = 0;

//     cohorts.filter(c => !c.isArchived).forEach(c => {
//         const startDate = new Date(c.startDate);
//         const endDate = new Date(c.endDate);
//         if (startDate > today) upcomingCohorts++;
//         else if (endDate < today) concludedCohorts++;
//         else ongoingCohorts++;
//     });

//     const activeCampusIds = new Set(cohorts.filter(c => !c.isArchived).map(c => c.campusId).filter(Boolean));
//     const activeCampusesCount = activeCampusIds.size;

//     // ─── AT-RISK & QA INTELLIGENCE ───
//     const atRiskLearnersCount = useMemo(() => {
//         let count = 0;
//         activeLearners.forEach(l => {
//             if (l.eisaAdmission) return;
//             let hasNYC = false;
//             const checkNYC = (mod: any) => {
//                 const s = mod.status?.toLowerCase();
//                 if (s === 'not yet competent' || s === 'nyc' || s === 'fail') hasNYC = true;
//             };
//             l.knowledgeModules?.forEach(checkNYC);
//             l.practicalModules?.forEach(checkNYC);
//             l.workExperienceModules?.forEach(checkNYC);

//             let isOverdue = false;
//             if (l.trainingEndDate) {
//                 const parts = l.trainingEndDate.split('-');
//                 if (parts.length === 3) {
//                     const isYearFirst = parts[0].length === 4;
//                     const endDate = isYearFirst
//                         ? new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]))
//                         : new Date(Number(parts[2]), Number(parts[1]) - 1, Number(parts[0]));
//                     if (endDate < today) isOverdue = true;
//                 }
//             }
//             if (hasNYC || isOverdue) count++;
//         });
//         return count;
//     }, [activeLearners, today]);

//     // ─── CHART DATA PREPARATION ───
//     const campusData = useMemo(() => {
//         if (!settings?.campuses || settings.campuses.length === 0) return [];
//         const counts: Record<string, number> = {};
//         settings.campuses.forEach(c => { counts[c.id] = 0; });
//         activeLearners.forEach(learner => {
//             const cohort = cohorts.find(c => c.id === learner.cohortId);
//             const campusId = learner.campusId || cohort?.campusId;
//             if (campusId && counts[campusId] !== undefined) {
//                 counts[campusId] += 1;
//             } else {
//                 const defaultCampus = settings.campuses.find(c => c.isDefault);
//                 if (defaultCampus) counts[defaultCampus.id] += 1;
//             }
//         });
//         return settings.campuses.map(c => ({
//             name: c.name.replace('Campus', '').replace('Hub', '').trim(),
//             learners: counts[c.id]
//         })).filter(c => c.learners > 0);
//     }, [activeLearners, cohorts, settings]);

//     const assessmentData = useMemo(() => {
//         const stats = {
//             Knowledge: { Competent: 0, NYC: 0, InProgress: 0 },
//             Practical: { Competent: 0, NYC: 0, InProgress: 0 },
//             Workplace: { Competent: 0, NYC: 0, InProgress: 0 }
//         };
//         const categorize = (status: string, category: 'Knowledge' | 'Practical' | 'Workplace') => {
//             const s = status?.toLowerCase() || '';
//             if (s === 'competent' || s === 'c' || s === 'pass') stats[category].Competent += 1;
//             else if (s === 'not yet competent' || s === 'nyc' || s === 'fail') stats[category].NYC += 1;
//             else stats[category].InProgress += 1;
//         };
//         activeLearners.forEach(l => {
//             l.knowledgeModules?.forEach(m => categorize(m.status, 'Knowledge'));
//             l.practicalModules?.forEach(m => categorize(m.status, 'Practical'));
//             l.workExperienceModules?.forEach(m => categorize(m.status, 'Workplace'));
//         });
//         return [
//             { name: 'Knowledge', ...stats.Knowledge },
//             { name: 'Practical', ...stats.Practical },
//             { name: 'Workplace', ...stats.Workplace }
//         ];
//     }, [activeLearners]);

//     const cohortLifecycleData = [
//         { name: 'Ongoing Classes', value: ongoingCohorts, color: 'var(--mlab-blue)' },
//         { name: 'Concluded Classes', value: concludedCohorts, color: 'var(--mlab-green)' },
//         { name: 'Upcoming Classes', value: upcomingCohorts, color: '#8b5cf6' }
//     ].filter(d => d.value > 0);

//     const web3Data = [
//         { name: 'Secured on Blockchain', value: securedCertificates, color: 'var(--mlab-green)' },
//         { name: 'Pending Mint', value: totalEnrollments - securedCertificates, color: '#f59e0b' }
//     ].filter(d => d.value > 0);

//     const tooltipStyle = {
//         borderRadius: '8px',
//         border: '1px solid var(--mlab-border)',
//         boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)',
//         fontFamily: 'var(--font-body)',
//         fontSize: '0.82rem',
//     };

//     return (
//         <div className="wm-root animate-fade-in" style={{ paddingBottom: '2rem' }}>

//             {/* ── PAGE HEADER ── */}
//             <div className="wm-page-header">
//                 <div className="wm-page-header__left">
//                     <div className="wm-page-header__icon"><LayoutDashboard size={22} /></div>
//                     <div>
//                         <h1 className="wm-page-header__title">System Overview</h1>
//                         <p className="wm-page-header__desc">High-level insights into academic performance, enrollments, and real-time operations.</p>
//                     </div>
//                 </div>
//             </div>

//             {/* ── ACTION REQUIRED (URGENT KPIs) ── */}
//             <h3 style={{ fontSize: '0.9rem', color: 'var(--mlab-grey)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 1rem 4px' }}>Action & Operations</h3>
//             <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
//                 <ModuleProgressCard
//                     type="Pending Marking"
//                     data={{ total: totalSubmissions > 0 ? totalSubmissions : 1, logged: pendingGradingCount }}
//                 // onClick={() => navigate('/admin?tab=assessments')}
//                 />
//                 <ModuleProgressCard
//                     type="Active Appeals"
//                     data={{ total: totalSubmissions > 0 ? totalSubmissions : 1, logged: pendingAppealsCount }}
//                 // onClick={() => navigate('/admin?tab=assessments')}
//                 />
//                 <ModuleProgressCard
//                     type="Live Classes"
//                     data={{ total: ongoingCohorts > 0 ? ongoingCohorts : 1, logged: liveClassesCount }}
//                     onClick={() => navigate('/admin?tab=attendance')}
//                 />
//             </div>

//             {/* ── SYSTEM THROUGHPUT ── */}
//             <h3 style={{ fontSize: '0.9rem', color: 'var(--mlab-grey)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 1rem 4px' }}>Capacity & Throughput</h3>
//             <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
//                 <ModuleProgressCard
//                     type="Active Qualifications"
//                     data={{ total: programmes.length > 0 ? programmes.length : 1, logged: activeProgrammesCount }}
//                 />
//                 <ModuleProgressCard
//                     type="Active Cohorts"
//                     data={{ total: cohorts.length > 0 ? cohorts.length : 1, logged: ongoingCohorts }}
//                 />
//                 <ModuleProgressCard
//                     type="Active Learners"
//                     data={{ total: learners.length > 0 ? learners.length : 1, logged: totalEnrollments }}
//                 />
//                 <ModuleProgressCard
//                     type="Active Campuses"
//                     data={{ total: settings?.campuses?.length || activeCampusesCount || 1, logged: activeCampusesCount }}
//                 />
//             </div>

//             {/* ── ACADEMIC QA & BLOCKCHAIN ── */}
//             <h3 style={{ fontSize: '0.9rem', color: 'var(--mlab-grey)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 1rem 4px' }}>Quality Assurance & Certification</h3>
//             <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
//                 <ModuleProgressCard
//                     type="EISA Readiness"
//                     data={{ total: totalEnrollments > 0 ? totalEnrollments : 1, logged: eisaReadyCount }}
//                 />
//                 <ModuleProgressCard
//                     type="At-Risk Analytics"
//                     data={{ total: totalEnrollments > 0 ? totalEnrollments : 1, logged: atRiskLearnersCount }}
//                 />
//                 <ModuleProgressCard
//                     type="Web3 Certificates"
//                     data={{ total: totalEnrollments > 0 ? totalEnrollments : 1, logged: securedCertificates }}
//                 />
//             </div>

//             {/* ── CHARTS ── */}
//             <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(450px, 1fr))', gap: '1.5rem' }}>

//                 {/* Formative Assessment Health */}
//                 <div className="wm-card">
//                     <div className="wm-card__header">
//                         <h3 className="wm-card__name" style={{ fontSize: '0.9rem' }}>Formative Assessment Health</h3>
//                     </div>
//                     <div style={{ padding: '1rem 1.1rem', height: '320px' }}>
//                         <ResponsiveContainer width="100%" height="100%">
//                             <BarChart data={assessmentData} margin={{ top: 5, right: 30, left: -20, bottom: 5 }}>
//                                 <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--mlab-border)" />
//                                 <XAxis dataKey="name" tick={{ fontSize: 12, fill: 'var(--mlab-grey)', fontFamily: 'var(--font-body)' }} axisLine={false} tickLine={false} />
//                                 <YAxis tick={{ fontSize: 12, fill: 'var(--mlab-grey)', fontFamily: 'var(--font-body)' }} axisLine={false} tickLine={false} />
//                                 <RechartsTooltip cursor={{ fill: 'var(--mlab-bg)' }} contentStyle={tooltipStyle} />
//                                 <Legend verticalAlign="top" height={36} iconType="circle" wrapperStyle={{ fontSize: '12px', fontFamily: 'var(--font-body)' }} />
//                                 <Bar dataKey="Competent" stackId="a" fill="var(--mlab-green)" radius={[0, 0, 4, 4]} />
//                                 <Bar dataKey="InProgress" stackId="a" fill="var(--mlab-blue)" name="In Progress" />
//                                 <Bar dataKey="NYC" stackId="a" fill="var(--mlab-red)" name="Not Yet Competent" radius={[4, 4, 0, 0]} />
//                             </BarChart>
//                         </ResponsiveContainer>
//                     </div>
//                 </div>

//                 {/* Enrollments by Location */}
//                 <div className="wm-card">
//                     <div className="wm-card__header">
//                         <h3 className="wm-card__name" style={{ fontSize: '0.9rem' }}>Enrollments by Location</h3>
//                     </div>
//                     <div style={{ padding: '1rem 1.1rem', height: '320px' }}>
//                         {campusData.length === 0 ? (
//                             <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--mlab-grey-light)', fontStyle: 'italic', fontSize: '0.85rem' }}>
//                                 No active enrollments assigned to campuses.
//                             </div>
//                         ) : (
//                             <ResponsiveContainer width="100%" height="100%">
//                                 <BarChart data={campusData} margin={{ top: 5, right: 30, left: -20, bottom: 5 }}>
//                                     <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--mlab-border)" />
//                                     <XAxis dataKey="name" tick={{ fontSize: 12, fill: 'var(--mlab-grey)', fontFamily: 'var(--font-body)' }} axisLine={false} tickLine={false} />
//                                     <YAxis tick={{ fontSize: 12, fill: 'var(--mlab-grey)', fontFamily: 'var(--font-body)' }} axisLine={false} tickLine={false} />
//                                     <RechartsTooltip cursor={{ fill: 'var(--mlab-bg)' }} contentStyle={tooltipStyle} />
//                                     <Bar dataKey="learners" fill="#8b5cf6" radius={[4, 4, 0, 0]} maxBarSize={50} name="Active Learners" />
//                                 </BarChart>
//                             </ResponsiveContainer>
//                         )}
//                     </div>
//                 </div>

//                 {/* Cohort Lifecycle */}
//                 <div className="wm-card">
//                     <div className="wm-card__header">
//                         <h3 className="wm-card__name" style={{ fontSize: '0.9rem' }}>Cohort Lifecycle</h3>
//                     </div>
//                     <div style={{ padding: '1rem 1.1rem', height: '320px' }}>
//                         {cohortLifecycleData.length === 0 ? (
//                             <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--mlab-grey-light)', fontStyle: 'italic', fontSize: '0.85rem' }}>
//                                 No active cohorts found.
//                             </div>
//                         ) : (
//                             <ResponsiveContainer width="100%" height="100%">
//                                 <PieChart>
//                                     <Pie data={cohortLifecycleData} cx="50%" cy="45%" innerRadius={70} outerRadius={100} paddingAngle={2} dataKey="value">
//                                         {cohortLifecycleData.map((entry, index) => (
//                                             <Cell key={`cell-${index}`} fill={entry.color} />
//                                         ))}
//                                     </Pie>
//                                     <RechartsTooltip contentStyle={tooltipStyle} />
//                                     <Legend verticalAlign="bottom" height={36} iconType="circle" wrapperStyle={{ fontFamily: 'var(--font-body)' }} />
//                                 </PieChart>
//                             </ResponsiveContainer>
//                         )}
//                     </div>
//                 </div>

//                 {/* Certification Status */}
//                 <div className="wm-card">
//                     <div className="wm-card__header">
//                         <h3 className="wm-card__name" style={{ fontSize: '0.9rem' }}>Certification Status</h3>
//                     </div>
//                     <div style={{ padding: '1rem 1.1rem', height: '320px' }}>
//                         {totalEnrollments === 0 ? (
//                             <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--mlab-grey-light)', fontStyle: 'italic', fontSize: '0.85rem' }}>
//                                 No enrollments to certify yet.
//                             </div>
//                         ) : (
//                             <ResponsiveContainer width="100%" height="100%">
//                                 <PieChart>
//                                     <Pie data={web3Data} cx="50%" cy="45%" innerRadius={70} outerRadius={100} paddingAngle={2} dataKey="value">
//                                         {web3Data.map((entry, index) => (
//                                             <Cell key={`cell-${index}`} fill={entry.color} />
//                                         ))}
//                                     </Pie>
//                                     <RechartsTooltip contentStyle={tooltipStyle} />
//                                     <Legend verticalAlign="bottom" height={36} iconType="circle" wrapperStyle={{ fontFamily: 'var(--font-body)' }} />
//                                 </PieChart>
//                             </ResponsiveContainer>
//                         )}
//                     </div>
//                 </div>

//             </div>
//         </div>
//     );
// };


// // import React, { useMemo, useState, useEffect } from 'react';
// // import { useNavigate } from 'react-router-dom';
// // import {
// //     Users, ShieldCheck, MapPin, GraduationCap, BookOpen,
// //     Layers, AlertTriangle, Scale, LayoutDashboard, FileSignature, MonitorPlay
// // } from 'lucide-react';
// // import {
// //     BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer,
// //     PieChart, Pie, Cell, Legend
// // } from 'recharts';
// // import { collection, query, where, getDocs } from 'firebase/firestore';
// // import { db } from '../../../lib/firebase';
// // import { useStore } from '../../../store/useStore';
// // import './DashboardOverview.css';
// // import StatCard from '../../common/StatCard/StatCard';

// // export const DashboardOverview: React.FC = () => {
// //     // 1. Destructure fetch actions to guarantee data loads on direct navigation
// //     const { learners, cohorts, programmes, settings, user, fetchLearners, fetchCohorts, fetchProgrammes } = useStore();
// //     const navigate = useNavigate();

// //     const [pendingAppealsCount, setPendingAppealsCount] = useState(0);
// //     const [pendingGradingCount, setPendingGradingCount] = useState(0);
// //     const [liveClassesCount, setLiveClassesCount] = useState(0);

// //     // ─── INITIALIZE GLOBAL STORE DATA ───
// //     useEffect(() => {
// //         if (learners.length === 0 && fetchLearners) fetchLearners();
// //         if (cohorts.length === 0 && fetchCohorts) fetchCohorts();
// //         if (programmes.length === 0 && fetchProgrammes) fetchProgrammes();
// //     }, []);

// //     // ─── FETCH LIVE ACTIONABLE METRICS ───
// //     useEffect(() => {
// //         const fetchLiveMetrics = async () => {
// //             try {
// //                 // 1. Fetch Appeals
// //                 const appealsSnap = await getDocs(query(collection(db, 'learner_submissions'), where('status', '==', 'appealed')));
// //                 setPendingAppealsCount(appealsSnap.size);

// //                 // 2. Fetch Pending Grading (Assessments submitted but not yet graded)
// //                 const gradingSnap = await getDocs(query(collection(db, 'learner_submissions'), where('status', '==', 'submitted')));
// //                 setPendingGradingCount(gradingSnap.size);

// //                 // 3. Fetch Live Kiosk Sessions for Today
// //                 const todayStr = new Date().toISOString().split('T')[0];
// //                 const liveSnap = await getDocs(query(
// //                     collection(db, 'kiosk_sessions'),
// //                     where('date', '==', todayStr),
// //                     where('status', '==', 'active')
// //                 ));
// //                 setLiveClassesCount(liveSnap.size);
// //             } catch (err) {
// //                 console.error("Failed to fetch live admin metrics:", err);
// //             }
// //         };
// //         fetchLiveMetrics();
// //     }, []);

// //     // ─── CORE ACADEMIC KPIs ───
// //     const activeLearners = learners.filter(l => !l.isArchived);
// //     const totalEnrollments = activeLearners.length;
// //     const securedCertificates = activeLearners.filter(l => l.isBlockchainVerified).length;
// //     const eisaReadyCount = activeLearners.filter(l => l.eisaAdmission).length;

// //     // ─── SYSTEM THROUGHPUT ───
// //     const activeProgrammesCount = programmes.filter(p => !p.isArchived).length;

// //     const today = new Date();
// //     today.setHours(0, 0, 0, 0);

// //     let upcomingCohorts = 0;
// //     let ongoingCohorts = 0;
// //     let concludedCohorts = 0;

// //     cohorts.filter(c => !c.isArchived).forEach(c => {
// //         const startDate = new Date(c.startDate);
// //         const endDate = new Date(c.endDate);
// //         if (startDate > today) upcomingCohorts++;
// //         else if (endDate < today) concludedCohorts++;
// //         else ongoingCohorts++;
// //     });

// //     const activeCampusIds = new Set(cohorts.filter(c => !c.isArchived).map(c => c.campusId).filter(Boolean));
// //     const activeCampusesCount = activeCampusIds.size;

// //     // ─── AT-RISK & QA INTELLIGENCE ───
// //     const atRiskLearnersCount = useMemo(() => {
// //         let count = 0;
// //         activeLearners.forEach(l => {
// //             if (l.eisaAdmission) return;
// //             let hasNYC = false;
// //             const checkNYC = (mod: any) => {
// //                 const s = mod.status?.toLowerCase();
// //                 if (s === 'not yet competent' || s === 'nyc' || s === 'fail') hasNYC = true;
// //             };
// //             l.knowledgeModules?.forEach(checkNYC);
// //             l.practicalModules?.forEach(checkNYC);
// //             l.workExperienceModules?.forEach(checkNYC);

// //             let isOverdue = false;
// //             if (l.trainingEndDate) {
// //                 const parts = l.trainingEndDate.split('-');
// //                 if (parts.length === 3) {
// //                     const isYearFirst = parts[0].length === 4;
// //                     const endDate = isYearFirst
// //                         ? new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]))
// //                         : new Date(Number(parts[2]), Number(parts[1]) - 1, Number(parts[0]));
// //                     if (endDate < today) isOverdue = true;
// //                 }
// //             }
// //             if (hasNYC || isOverdue) count++;
// //         });
// //         return count;
// //     }, [activeLearners, today]);

// //     // ─── CHART DATA PREPARATION ───
// //     const campusData = useMemo(() => {
// //         if (!settings?.campuses || settings.campuses.length === 0) return [];
// //         const counts: Record<string, number> = {};
// //         settings.campuses.forEach(c => { counts[c.id] = 0; });
// //         activeLearners.forEach(learner => {
// //             const cohort = cohorts.find(c => c.id === learner.cohortId);
// //             const campusId = learner.campusId || cohort?.campusId;
// //             if (campusId && counts[campusId] !== undefined) {
// //                 counts[campusId] += 1;
// //             } else {
// //                 const defaultCampus = settings.campuses.find(c => c.isDefault);
// //                 if (defaultCampus) counts[defaultCampus.id] += 1;
// //             }
// //         });
// //         return settings.campuses.map(c => ({
// //             name: c.name.replace('Campus', '').replace('Hub', '').trim(),
// //             learners: counts[c.id]
// //         })).filter(c => c.learners > 0);
// //     }, [activeLearners, cohorts, settings]);

// //     const assessmentData = useMemo(() => {
// //         const stats = {
// //             Knowledge: { Competent: 0, NYC: 0, InProgress: 0 },
// //             Practical: { Competent: 0, NYC: 0, InProgress: 0 },
// //             Workplace: { Competent: 0, NYC: 0, InProgress: 0 }
// //         };
// //         const categorize = (status: string, category: 'Knowledge' | 'Practical' | 'Workplace') => {
// //             const s = status?.toLowerCase() || '';
// //             if (s === 'competent' || s === 'c' || s === 'pass') stats[category].Competent += 1;
// //             else if (s === 'not yet competent' || s === 'nyc' || s === 'fail') stats[category].NYC += 1;
// //             else stats[category].InProgress += 1;
// //         };
// //         activeLearners.forEach(l => {
// //             l.knowledgeModules?.forEach(m => categorize(m.status, 'Knowledge'));
// //             l.practicalModules?.forEach(m => categorize(m.status, 'Practical'));
// //             l.workExperienceModules?.forEach(m => categorize(m.status, 'Workplace'));
// //         });
// //         return [
// //             { name: 'Knowledge', ...stats.Knowledge },
// //             { name: 'Practical', ...stats.Practical },
// //             { name: 'Workplace', ...stats.Workplace }
// //         ];
// //     }, [activeLearners]);

// //     const cohortLifecycleData = [
// //         { name: 'Ongoing Classes', value: ongoingCohorts, color: 'var(--mlab-blue)' },
// //         { name: 'Concluded Classes', value: concludedCohorts, color: 'var(--mlab-green)' },
// //         { name: 'Upcoming Classes', value: upcomingCohorts, color: '#8b5cf6' }
// //     ].filter(d => d.value > 0);

// //     const web3Data = [
// //         { name: 'Secured on Blockchain', value: securedCertificates, color: 'var(--mlab-green)' },
// //         { name: 'Pending Mint', value: totalEnrollments - securedCertificates, color: '#f59e0b' }
// //     ].filter(d => d.value > 0);

// //     const tooltipStyle = {
// //         borderRadius: '8px',
// //         border: '1px solid var(--mlab-border)',
// //         boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)',
// //         fontFamily: 'var(--font-body)',
// //         fontSize: '0.82rem',
// //     };

// //     return (
// //         <div className="wm-root animate-fade-in" style={{ paddingBottom: '2rem' }}>

// //             {/* ── PAGE HEADER ── */}
// //             <div className="wm-page-header">
// //                 <div className="wm-page-header__left">
// //                     <div className="wm-page-header__icon"><LayoutDashboard size={22} /></div>
// //                     <div>
// //                         <h1 className="wm-page-header__title">System Overview</h1>
// //                         <p className="wm-page-header__desc">High-level insights into academic performance, enrollments, and real-time operations.</p>
// //                     </div>
// //                 </div>
// //             </div>

// //             {/* ── ACTION REQUIRED (URGENT KPIs) ── */}
// //             <h3 style={{ fontSize: '0.9rem', color: 'var(--mlab-grey)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 1rem 4px' }}>Action & Operations</h3>
// //             <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.25rem', marginBottom: '2rem' }}>
// //                 <StatCard
// //                     icon={<FileSignature size={20} />}
// //                     title="Pending Grading"
// //                     value={pendingGradingCount}
// //                     borderColor={pendingGradingCount > 0 ? "#f59e0b" : "var(--mlab-green)"}
// //                     onClick={() => navigate('/assessments')}
// //                     hoverable
// //                 />
// //                 <StatCard
// //                     icon={<Scale size={20} />}
// //                     title="Active Appeals"
// //                     value={pendingAppealsCount}
// //                     borderColor={pendingAppealsCount > 0 ? "var(--mlab-red)" : "var(--mlab-green)"}
// //                     onClick={() => navigate('/moderation')}
// //                     hoverable
// //                 />
// //                 <StatCard
// //                     icon={<MonitorPlay size={20} />}
// //                     title="Live Classes Today"
// //                     value={liveClassesCount}
// //                     borderColor={liveClassesCount > 0 ? "var(--mlab-blue)" : "var(--mlab-grey-light)"}
// //                     onClick={() => navigate('/attendance')}
// //                     hoverable
// //                 />
// //             </div>

// //             {/* ── SYSTEM THROUGHPUT ── */}
// //             <h3 style={{ fontSize: '0.9rem', color: 'var(--mlab-grey)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 1rem 4px' }}>Capacity & Throughput</h3>
// //             <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.25rem', marginBottom: '2rem' }}>
// //                 <StatCard icon={<BookOpen size={20} />} title="Active Qualifications" value={activeProgrammesCount} borderColor="var(--mlab-blue)" />
// //                 <StatCard icon={<Layers size={20} />} title="Active Cohorts" value={ongoingCohorts} borderColor="#8b5cf6" />
// //                 <StatCard icon={<Users size={20} />} title="Total Enrollments" value={totalEnrollments} borderColor="var(--mlab-blue)" />
// //                 <StatCard icon={<MapPin size={20} />} title="Active Campuses" value={activeCampusesCount} borderColor="#f59e0b" />
// //             </div>

// //             {/* ── ACADEMIC QA & BLOCKCHAIN ── */}
// //             <h3 style={{ fontSize: '0.9rem', color: 'var(--mlab-grey)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 1rem 4px' }}>Quality Assurance & Certification</h3>
// //             <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.25rem', marginBottom: '2rem' }}>
// //                 <StatCard icon={<GraduationCap size={20} />} title="EISA Admitted (Ready)" value={eisaReadyCount} borderColor="var(--mlab-green)" />
// //                 <StatCard icon={<AlertTriangle size={20} />} title="At-Risk Learners" value={atRiskLearnersCount} borderColor="var(--mlab-red)" />
// //                 <StatCard icon={<ShieldCheck size={20} />} title="Web3 Certificates Issued" value={securedCertificates} borderColor="#8b5cf6" />
// //             </div>

// //             {/* ── CHARTS ── */}
// //             <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(450px, 1fr))', gap: '1.25rem' }}>

// //                 {/* Formative Assessment Health */}
// //                 <div className="wm-card">
// //                     <div className="wm-card__header">
// //                         <h3 className="wm-card__name" style={{ fontSize: '0.9rem' }}>Formative Assessment Health</h3>
// //                     </div>
// //                     <div style={{ padding: '1rem 1.1rem', height: '320px' }}>
// //                         <ResponsiveContainer width="100%" height="100%">
// //                             <BarChart data={assessmentData} margin={{ top: 5, right: 30, left: -20, bottom: 5 }}>
// //                                 <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--mlab-border)" />
// //                                 <XAxis dataKey="name" tick={{ fontSize: 12, fill: 'var(--mlab-grey)', fontFamily: 'var(--font-body)' }} axisLine={false} tickLine={false} />
// //                                 <YAxis tick={{ fontSize: 12, fill: 'var(--mlab-grey)', fontFamily: 'var(--font-body)' }} axisLine={false} tickLine={false} />
// //                                 <RechartsTooltip cursor={{ fill: 'var(--mlab-bg)' }} contentStyle={tooltipStyle} />
// //                                 <Legend verticalAlign="top" height={36} iconType="circle" wrapperStyle={{ fontSize: '12px', fontFamily: 'var(--font-body)' }} />
// //                                 <Bar dataKey="Competent" stackId="a" fill="var(--mlab-green)" radius={[0, 0, 4, 4]} />
// //                                 <Bar dataKey="InProgress" stackId="a" fill="var(--mlab-blue)" name="In Progress" />
// //                                 <Bar dataKey="NYC" stackId="a" fill="var(--mlab-red)" name="Not Yet Competent" radius={[4, 4, 0, 0]} />
// //                             </BarChart>
// //                         </ResponsiveContainer>
// //                     </div>
// //                 </div>

// //                 {/* Enrollments by Location */}
// //                 <div className="wm-card">
// //                     <div className="wm-card__header">
// //                         <h3 className="wm-card__name" style={{ fontSize: '0.9rem' }}>Enrollments by Location</h3>
// //                     </div>
// //                     <div style={{ padding: '1rem 1.1rem', height: '320px' }}>
// //                         {campusData.length === 0 ? (
// //                             <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--mlab-grey-light)', fontStyle: 'italic', fontSize: '0.85rem' }}>
// //                                 No active enrollments assigned to campuses.
// //                             </div>
// //                         ) : (
// //                             <ResponsiveContainer width="100%" height="100%">
// //                                 <BarChart data={campusData} margin={{ top: 5, right: 30, left: -20, bottom: 5 }}>
// //                                     <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--mlab-border)" />
// //                                     <XAxis dataKey="name" tick={{ fontSize: 12, fill: 'var(--mlab-grey)', fontFamily: 'var(--font-body)' }} axisLine={false} tickLine={false} />
// //                                     <YAxis tick={{ fontSize: 12, fill: 'var(--mlab-grey)', fontFamily: 'var(--font-body)' }} axisLine={false} tickLine={false} />
// //                                     <RechartsTooltip cursor={{ fill: 'var(--mlab-bg)' }} contentStyle={tooltipStyle} />
// //                                     <Bar dataKey="learners" fill="#8b5cf6" radius={[4, 4, 0, 0]} maxBarSize={50} name="Active Learners" />
// //                                 </BarChart>
// //                             </ResponsiveContainer>
// //                         )}
// //                     </div>
// //                 </div>

// //                 {/* Cohort Lifecycle */}
// //                 <div className="wm-card">
// //                     <div className="wm-card__header">
// //                         <h3 className="wm-card__name" style={{ fontSize: '0.9rem' }}>Cohort Lifecycle</h3>
// //                     </div>
// //                     <div style={{ padding: '1rem 1.1rem', height: '320px' }}>
// //                         {cohortLifecycleData.length === 0 ? (
// //                             <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--mlab-grey-light)', fontStyle: 'italic', fontSize: '0.85rem' }}>
// //                                 No active cohorts found.
// //                             </div>
// //                         ) : (
// //                             <ResponsiveContainer width="100%" height="100%">
// //                                 <PieChart>
// //                                     <Pie data={cohortLifecycleData} cx="50%" cy="45%" innerRadius={70} outerRadius={100} paddingAngle={2} dataKey="value">
// //                                         {cohortLifecycleData.map((entry, index) => (
// //                                             <Cell key={`cell-${index}`} fill={entry.color} />
// //                                         ))}
// //                                     </Pie>
// //                                     <RechartsTooltip contentStyle={tooltipStyle} />
// //                                     <Legend verticalAlign="bottom" height={36} iconType="circle" wrapperStyle={{ fontFamily: 'var(--font-body)' }} />
// //                                 </PieChart>
// //                             </ResponsiveContainer>
// //                         )}
// //                     </div>
// //                 </div>

// //                 {/* Certification Status */}
// //                 <div className="wm-card">
// //                     <div className="wm-card__header">
// //                         <h3 className="wm-card__name" style={{ fontSize: '0.9rem' }}>Certification Status</h3>
// //                     </div>
// //                     <div style={{ padding: '1rem 1.1rem', height: '320px' }}>
// //                         {totalEnrollments === 0 ? (
// //                             <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--mlab-grey-light)', fontStyle: 'italic', fontSize: '0.85rem' }}>
// //                                 No enrollments to certify yet.
// //                             </div>
// //                         ) : (
// //                             <ResponsiveContainer width="100%" height="100%">
// //                                 <PieChart>
// //                                     <Pie data={web3Data} cx="50%" cy="45%" innerRadius={70} outerRadius={100} paddingAngle={2} dataKey="value">
// //                                         {web3Data.map((entry, index) => (
// //                                             <Cell key={`cell-${index}`} fill={entry.color} />
// //                                         ))}
// //                                     </Pie>
// //                                     <RechartsTooltip contentStyle={tooltipStyle} />
// //                                     <Legend verticalAlign="bottom" height={36} iconType="circle" wrapperStyle={{ fontFamily: 'var(--font-body)' }} />
// //                                 </PieChart>
// //                             </ResponsiveContainer>
// //                         )}
// //                     </div>
// //                 </div>

// //             </div>
// //         </div>
// //     );
// // };



// // // // src/components/views/DashboardOverview/DashboardOverview.tsx

// // // import React, { useMemo, useState, useEffect } from 'react';
// // // import { useNavigate } from 'react-router-dom';
// // // import { Users, ShieldCheck, MapPin, GraduationCap, BookOpen, Layers, AlertTriangle, Scale, LayoutDashboard } from 'lucide-react';
// // // import {
// // //     BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer,
// // //     PieChart, Pie, Cell, Legend
// // // } from 'recharts';
// // // import { collection, query, where, getDocs } from 'firebase/firestore';
// // // import { db } from '../../../lib/firebase';
// // // import { useStore } from '../../../store/useStore';
// // // // import '../../admin/WorkplacesManager/WorkplacesManager.css';
// // // import './DashboardOverview.css';
// // // import StatCard from '../../common/StatCard/StatCard';

// // // // // ─── LOCAL STAT CARD (Reusing wm-card styles) ───
// // // // const DashboardStatCard = ({ title, value, icon, borderColor, onClick, hoverable }: any) => (
// // // //     <div
// // // //         className="wm-card"
// // // //         onClick={onClick}
// // // //         style={{
// // // //             borderTopColor: borderColor || 'var(--mlab-blue)',
// // // //             cursor: onClick ? 'pointer' : 'default',
// // // //             transform: hoverable ? undefined : 'none',
// // // //             transition: 'transform 0.2s, box-shadow 0.2s',
// // // //             height: '100%'
// // // //         }}
// // // //         onMouseEnter={e => {
// // // //             if (hoverable) {
// // // //                 e.currentTarget.style.transform = 'translateY(-3px)';
// // // //                 e.currentTarget.style.boxShadow = '0 8px 20px rgba(0,0,0,0.08)';
// // // //             }
// // // //         }}
// // // //         onMouseLeave={e => {
// // // //             if (hoverable) {
// // // //                 e.currentTarget.style.transform = 'none';
// // // //                 e.currentTarget.style.boxShadow = '0 2px 8px rgba(7, 63, 78, 0.05)';
// // // //             }
// // // //         }}
// // // //     >
// // // //         <div className="wm-card__header" style={{ paddingBottom: '0.5rem' }}>
// // // //             <h3 className="wm-card__name" style={{ fontSize: '0.85rem', color: 'var(--mlab-grey)' }}>{title}</h3>
// // // //             <div style={{ color: borderColor || 'var(--mlab-blue)', opacity: 0.8 }}>{icon}</div>
// // // //         </div>
// // // //         <div style={{ padding: '0 1.1rem 1.1rem', fontSize: '2.2rem', fontWeight: 'bold', color: 'var(--mlab-blue)', fontFamily: 'var(--font-heading)' }}>
// // // //             {value}
// // // //         </div>
// // // //     </div>
// // // // );

// // // export const DashboardOverview: React.FC = () => {
// // //     const { learners, cohorts, programmes, settings, user } = useStore();
// // //     const navigate = useNavigate();

// // //     // ─── CORE ACADEMIC KPIs ───
// // //     const activeLearners = learners.filter(l => !l.isArchived);
// // //     const totalEnrollments = activeLearners.length;
// // //     const securedCertificates = activeLearners.filter(l => l.isBlockchainVerified).length;
// // //     const eisaReadyCount = activeLearners.filter(l => l.eisaAdmission).length;

// // //     // ─── SYSTEM THROUGHPUT ───
// // //     const activeProgrammesCount = programmes.filter(p => !p.isArchived).length;

// // //     const today = new Date();
// // //     today.setHours(0, 0, 0, 0);

// // //     let upcomingCohorts = 0;
// // //     let ongoingCohorts = 0;
// // //     let concludedCohorts = 0;

// // //     cohorts.filter(c => !c.isArchived).forEach(c => {
// // //         const startDate = new Date(c.startDate);
// // //         const endDate = new Date(c.endDate);
// // //         if (startDate > today) upcomingCohorts++;
// // //         else if (endDate < today) concludedCohorts++;
// // //         else ongoingCohorts++;
// // //     });

// // //     const activeCampusIds = new Set(cohorts.filter(c => !c.isArchived).map(c => c.campusId).filter(Boolean));
// // //     const activeCampusesCount = activeCampusIds.size;

// // //     // ─── AT-RISK & QA INTELLIGENCE ───
// // //     const atRiskLearnersCount = useMemo(() => {
// // //         let count = 0;
// // //         activeLearners.forEach(l => {
// // //             if (l.eisaAdmission) return;
// // //             let hasNYC = false;
// // //             const checkNYC = (mod: any) => {
// // //                 const s = mod.status?.toLowerCase();
// // //                 if (s === 'not yet competent' || s === 'nyc' || s === 'fail') hasNYC = true;
// // //             };
// // //             l.knowledgeModules?.forEach(checkNYC);
// // //             l.practicalModules?.forEach(checkNYC);
// // //             l.workExperienceModules?.forEach(checkNYC);

// // //             let isOverdue = false;
// // //             if (l.trainingEndDate) {
// // //                 const parts = l.trainingEndDate.split('-');
// // //                 if (parts.length === 3) {
// // //                     const isYearFirst = parts[0].length === 4;
// // //                     const endDate = isYearFirst
// // //                         ? new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]))
// // //                         : new Date(Number(parts[2]), Number(parts[1]) - 1, Number(parts[0]));
// // //                     if (endDate < today) isOverdue = true;
// // //                 }
// // //             }
// // //             if (hasNYC || isOverdue) count++;
// // //         });
// // //         return count;
// // //     }, [activeLearners, today]);

// // //     // Fetch global active appeals count
// // //     const [pendingAppealsCount, setPendingAppealsCount] = useState(0);
// // //     useEffect(() => {
// // //         const fetchAppealsCount = async () => {
// // //             try {
// // //                 const snap = await getDocs(query(
// // //                     collection(db, 'learner_submissions'),
// // //                     where('status', '==', 'appealed')
// // //                 ));
// // //                 setPendingAppealsCount(snap.size);
// // //             } catch (err) {
// // //                 console.error("Failed to fetch pending appeals count:", err);
// // //             }
// // //         };
// // //         fetchAppealsCount();
// // //     }, []);

// // //     // ─── CHART DATA ───
// // //     const campusData = useMemo(() => {
// // //         if (!settings?.campuses || settings.campuses.length === 0) return [];
// // //         const counts: Record<string, number> = {};
// // //         settings.campuses.forEach(c => { counts[c.id] = 0; });
// // //         activeLearners.forEach(learner => {
// // //             const cohort = cohorts.find(c => c.id === learner.cohortId);
// // //             const campusId = learner.campusId || cohort?.campusId;
// // //             if (campusId && counts[campusId] !== undefined) {
// // //                 counts[campusId] += 1;
// // //             } else {
// // //                 const defaultCampus = settings.campuses.find(c => c.isDefault);
// // //                 if (defaultCampus) counts[defaultCampus.id] += 1;
// // //             }
// // //         });
// // //         return settings.campuses.map(c => ({
// // //             name: c.name.replace('Campus', '').replace('Hub', '').trim(),
// // //             learners: counts[c.id]
// // //         })).filter(c => c.learners > 0);
// // //     }, [activeLearners, cohorts, settings]);

// // //     const assessmentData = useMemo(() => {
// // //         const stats = {
// // //             Knowledge: { Competent: 0, NYC: 0, InProgress: 0 },
// // //             Practical: { Competent: 0, NYC: 0, InProgress: 0 },
// // //             Workplace: { Competent: 0, NYC: 0, InProgress: 0 }
// // //         };
// // //         const categorize = (status: string, category: 'Knowledge' | 'Practical' | 'Workplace') => {
// // //             const s = status?.toLowerCase() || '';
// // //             if (s === 'competent' || s === 'c' || s === 'pass') stats[category].Competent += 1;
// // //             else if (s === 'not yet competent' || s === 'nyc' || s === 'fail') stats[category].NYC += 1;
// // //             else stats[category].InProgress += 1;
// // //         };
// // //         activeLearners.forEach(l => {
// // //             l.knowledgeModules?.forEach(m => categorize(m.status, 'Knowledge'));
// // //             l.practicalModules?.forEach(m => categorize(m.status, 'Practical'));
// // //             l.workExperienceModules?.forEach(m => categorize(m.status, 'Workplace'));
// // //         });
// // //         return [
// // //             { name: 'Knowledge', ...stats.Knowledge },
// // //             { name: 'Practical', ...stats.Practical },
// // //             { name: 'Workplace', ...stats.Workplace }
// // //         ];
// // //     }, [activeLearners]);

// // //     const cohortLifecycleData = [
// // //         { name: 'Ongoing Classes', value: ongoingCohorts, color: 'var(--mlab-blue)' },
// // //         { name: 'Concluded Classes', value: concludedCohorts, color: 'var(--mlab-green)' },
// // //         { name: 'Upcoming Classes', value: upcomingCohorts, color: '#8b5cf6' }
// // //     ].filter(d => d.value > 0);

// // //     const web3Data = [
// // //         { name: 'Secured on Blockchain', value: securedCertificates, color: 'var(--mlab-green)' },
// // //         { name: 'Pending Mint', value: totalEnrollments - securedCertificates, color: '#f59e0b' }
// // //     ].filter(d => d.value > 0);

// // //     const tooltipStyle = {
// // //         borderRadius: '8px',
// // //         border: '1px solid var(--mlab-border)',
// // //         boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)',
// // //         fontFamily: 'var(--font-body)',
// // //         fontSize: '0.82rem',
// // //     };

// // //     return (
// // //         <div className="wm-root animate-fade-in" style={{ paddingBottom: '2rem' }}>

// // //             {/* ── PAGE HEADER (Reusing wm-page-header styling) ── */}
// // //             <div className="wm-page-header">
// // //                 <div className="wm-page-header__left">
// // //                     <div className="wm-page-header__icon"><LayoutDashboard size={22} /></div>
// // //                     <div>
// // //                         <h1 className="wm-page-header__title">System Overview</h1>
// // //                         <p className="wm-page-header__desc">High-level insights into academic performance, enrollments, and throughput.</p>
// // //                     </div>
// // //                 </div>
// // //             </div>

// // //             {/* ── KPI RIBBON ── */}
// // //             <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.25rem', marginBottom: '1.5rem' }}>
// // //                 <StatCard
// // //                     icon={<BookOpen size={20} />} title="Active Qualifications" value={activeProgrammesCount} borderColor="var(--mlab-blue)" />
// // //                 <StatCard icon={<Layers size={20} />} title="Active Cohorts" value={ongoingCohorts} borderColor="#8b5cf6" />
// // //                 <StatCard icon={<Users size={20} />} title="Total Enrollments" value={totalEnrollments} borderColor="var(--mlab-blue)" />
// // //                 <StatCard icon={<MapPin size={20} />} title="Active Delivery Sites" value={activeCampusesCount} borderColor="#f59e0b" />

// // //                 <StatCard icon={<GraduationCap size={20} />} title="EISA Admitted (Ready)" value={eisaReadyCount} borderColor="var(--mlab-green)" />
// // //                 <StatCard icon={<AlertTriangle size={20} />} title="At-Risk Learners" value={atRiskLearnersCount} borderColor="var(--mlab-red)" />

// // //                 <StatCard
// // //                     icon={<Scale size={20} />}
// // //                     title="Active Appeals"
// // //                     value={pendingAppealsCount}
// // //                     borderColor={pendingAppealsCount > 0 ? "var(--mlab-red)" : "var(--mlab-blue)"}
// // //                     onClick={() => { if (user?.role === 'admin' || user?.role === 'moderator') navigate('/moderation'); }}
// // //                     hoverable={user?.role === 'admin' || user?.role === 'moderator'}
// // //                 />

// // //                 <StatCard icon={<ShieldCheck size={20} />} title="Web3 Certificates Issued" value={securedCertificates} borderColor="#8b5cf6" />
// // //             </div>

// // //             {/* ── CHARTS ── */}
// // //             <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(450px, 1fr))', gap: '1.25rem' }}>

// // //                 {/* Formative Assessment Health */}
// // //                 <div className="wm-card">
// // //                     <div className="wm-card__header">
// // //                         <h3 className="wm-card__name" style={{ fontSize: '0.9rem' }}>Formative Assessment Health</h3>
// // //                     </div>
// // //                     <div style={{ padding: '1rem 1.1rem', height: '320px' }}>
// // //                         <ResponsiveContainer width="100%" height="100%">
// // //                             <BarChart data={assessmentData} margin={{ top: 5, right: 30, left: -20, bottom: 5 }}>
// // //                                 <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--mlab-border)" />
// // //                                 <XAxis dataKey="name" tick={{ fontSize: 12, fill: 'var(--mlab-grey)', fontFamily: 'var(--font-body)' }} axisLine={false} tickLine={false} />
// // //                                 <YAxis tick={{ fontSize: 12, fill: 'var(--mlab-grey)', fontFamily: 'var(--font-body)' }} axisLine={false} tickLine={false} />
// // //                                 <RechartsTooltip cursor={{ fill: 'var(--mlab-bg)' }} contentStyle={tooltipStyle} />
// // //                                 <Legend verticalAlign="top" height={36} iconType="circle" wrapperStyle={{ fontSize: '12px', fontFamily: 'var(--font-body)' }} />
// // //                                 <Bar dataKey="Competent" stackId="a" fill="var(--mlab-green)" radius={[0, 0, 4, 4]} />
// // //                                 <Bar dataKey="InProgress" stackId="a" fill="var(--mlab-blue)" name="In Progress" />
// // //                                 <Bar dataKey="NYC" stackId="a" fill="var(--mlab-red)" name="Not Yet Competent" radius={[4, 4, 0, 0]} />
// // //                             </BarChart>
// // //                         </ResponsiveContainer>
// // //                     </div>
// // //                 </div>

// // //                 {/* Enrollments by Location */}
// // //                 <div className="wm-card">
// // //                     <div className="wm-card__header">
// // //                         <h3 className="wm-card__name" style={{ fontSize: '0.9rem' }}>Enrollments by Location</h3>
// // //                     </div>
// // //                     <div style={{ padding: '1rem 1.1rem', height: '320px' }}>
// // //                         {campusData.length === 0 ? (
// // //                             <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--mlab-grey-light)', fontStyle: 'italic', fontSize: '0.85rem' }}>
// // //                                 No active enrollments assigned to campuses.
// // //                             </div>
// // //                         ) : (
// // //                             <ResponsiveContainer width="100%" height="100%">
// // //                                 <BarChart data={campusData} margin={{ top: 5, right: 30, left: -20, bottom: 5 }}>
// // //                                     <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--mlab-border)" />
// // //                                     <XAxis dataKey="name" tick={{ fontSize: 12, fill: 'var(--mlab-grey)', fontFamily: 'var(--font-body)' }} axisLine={false} tickLine={false} />
// // //                                     <YAxis tick={{ fontSize: 12, fill: 'var(--mlab-grey)', fontFamily: 'var(--font-body)' }} axisLine={false} tickLine={false} />
// // //                                     <RechartsTooltip cursor={{ fill: 'var(--mlab-bg)' }} contentStyle={tooltipStyle} />
// // //                                     <Bar dataKey="learners" fill="#8b5cf6" radius={[4, 4, 0, 0]} maxBarSize={50} name="Active Learners" />
// // //                                 </BarChart>
// // //                             </ResponsiveContainer>
// // //                         )}
// // //                     </div>
// // //                 </div>

// // //                 {/* Cohort Lifecycle */}
// // //                 <div className="wm-card">
// // //                     <div className="wm-card__header">
// // //                         <h3 className="wm-card__name" style={{ fontSize: '0.9rem' }}>Cohort Lifecycle</h3>
// // //                     </div>
// // //                     <div style={{ padding: '1rem 1.1rem', height: '320px' }}>
// // //                         {cohortLifecycleData.length === 0 ? (
// // //                             <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--mlab-grey-light)', fontStyle: 'italic', fontSize: '0.85rem' }}>
// // //                                 No active cohorts found.
// // //                             </div>
// // //                         ) : (
// // //                             <ResponsiveContainer width="100%" height="100%">
// // //                                 <PieChart>
// // //                                     <Pie data={cohortLifecycleData} cx="50%" cy="45%" innerRadius={70} outerRadius={100} paddingAngle={2} dataKey="value">
// // //                                         {cohortLifecycleData.map((entry, index) => (
// // //                                             <Cell key={`cell-${index}`} fill={entry.color} />
// // //                                         ))}
// // //                                     </Pie>
// // //                                     <RechartsTooltip contentStyle={tooltipStyle} />
// // //                                     <Legend verticalAlign="bottom" height={36} iconType="circle" wrapperStyle={{ fontFamily: 'var(--font-body)' }} />
// // //                                 </PieChart>
// // //                             </ResponsiveContainer>
// // //                         )}
// // //                     </div>
// // //                 </div>

// // //                 {/* Certification Status */}
// // //                 <div className="wm-card">
// // //                     <div className="wm-card__header">
// // //                         <h3 className="wm-card__name" style={{ fontSize: '0.9rem' }}>Certification Status</h3>
// // //                     </div>
// // //                     <div style={{ padding: '1rem 1.1rem', height: '320px' }}>
// // //                         {totalEnrollments === 0 ? (
// // //                             <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--mlab-grey-light)', fontStyle: 'italic', fontSize: '0.85rem' }}>
// // //                                 No enrollments to certify yet.
// // //                             </div>
// // //                         ) : (
// // //                             <ResponsiveContainer width="100%" height="100%">
// // //                                 <PieChart>
// // //                                     <Pie data={web3Data} cx="50%" cy="45%" innerRadius={70} outerRadius={100} paddingAngle={2} dataKey="value">
// // //                                         {web3Data.map((entry, index) => (
// // //                                             <Cell key={`cell-${index}`} fill={entry.color} />
// // //                                         ))}
// // //                                     </Pie>
// // //                                     <RechartsTooltip contentStyle={tooltipStyle} />
// // //                                     <Legend verticalAlign="bottom" height={36} iconType="circle" wrapperStyle={{ fontFamily: 'var(--font-body)' }} />
// // //                                 </PieChart>
// // //                             </ResponsiveContainer>
// // //                         )}
// // //                     </div>
// // //                 </div>

// // //             </div>
// // //         </div>
// // //     );
// // // };
