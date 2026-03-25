// src/components/views/DashboardOverview/DashboardOverview.tsx

import React, { useMemo, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, ShieldCheck, MapPin, GraduationCap, BookOpen, Layers, AlertTriangle, Scale } from 'lucide-react';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer,
    PieChart, Pie, Cell, Legend
} from 'recharts';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../../../lib/firebase';
import { useStore } from '../../../store/useStore';
import { StatCard } from '../../common/StatCard';
import './DashboardOverview.css';

export const DashboardOverview: React.FC = () => {
    const { learners, cohorts, programmes, settings, user } = useStore();
    const navigate = useNavigate();

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

    // Fetch global active appeals count
    const [pendingAppealsCount, setPendingAppealsCount] = useState(0);
    useEffect(() => {
        const fetchAppealsCount = async () => {
            try {
                const snap = await getDocs(query(
                    collection(db, 'learner_submissions'),
                    where('status', '==', 'appealed')
                ));
                setPendingAppealsCount(snap.size);
            } catch (err) {
                console.error("Failed to fetch pending appeals count:", err);
            }
        };
        fetchAppealsCount();
    }, []);

    // ─── CHART DATA ───
    const campusData = useMemo(() => {
        if (!settings?.campuses || settings.campuses.length === 0) return [];
        const counts: Record<string, number> = {};
        settings.campuses.forEach(c => { counts[c.id] = 0; });
        activeLearners.forEach(learner => {
            const cohort = cohorts.find(c => c.id === learner.cohortId);
            const campusId = learner.campusId || cohort?.campusId;
            if (campusId && counts[campusId] !== undefined) {
                counts[campusId] += 1;
            } else {
                const defaultCampus = settings.campuses.find(c => c.isDefault);
                if (defaultCampus) counts[defaultCampus.id] += 1;
            }
        });
        return settings.campuses.map(c => ({
            name: c.name.replace('Campus', '').replace('Hub', '').trim(),
            learners: counts[c.id]
        })).filter(c => c.learners > 0);
    }, [activeLearners, cohorts, settings]);

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
        { name: 'Ongoing Classes', value: ongoingCohorts, color: '#3b82f6' },
        { name: 'Concluded Classes', value: concludedCohorts, color: '#10b981' },
        { name: 'Upcoming Classes', value: upcomingCohorts, color: '#8b5cf6' }
    ].filter(d => d.value > 0);

    const web3Data = [
        { name: 'Secured on Blockchain', value: securedCertificates, color: '#10b981' },
        { name: 'Pending Mint', value: totalEnrollments - securedCertificates, color: '#f59e0b' }
    ].filter(d => d.value > 0);

    const tooltipStyle = {
        borderRadius: '8px',
        border: 'none',
        boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)',
        fontFamily: 'Trebuchet MS, sans-serif',
        fontSize: '0.82rem',
    };

    return (
        <div className="dashboard-overview animate-fade-in">

            {/* ── KPI RIBBON — two rows of 4 ── */}
            <div className="dov-kpi-stack">
                <div className="edit-grid">
                    <StatCard icon={<BookOpen size={24} />} title="Active Qualifications" value={activeProgrammesCount} color="blue" />
                    <StatCard icon={<Layers size={24} />} title="Active Cohorts / Classes" value={ongoingCohorts} color="purple" />
                    <StatCard icon={<Users size={24} />} title="Total Active Enrollments" value={totalEnrollments} color="blue" />
                    <StatCard icon={<MapPin size={24} />} title="Active Delivery Sites" value={activeCampusesCount} color="orange" />
                </div>
                <div className="edit-grid">
                    <StatCard icon={<GraduationCap size={24} />} title="EISA Admitted (Ready)" value={eisaReadyCount} color="green" />
                    <StatCard icon={<AlertTriangle size={24} />} title="At-Risk Learners" value={atRiskLearnersCount} color="red" />

                    {/* Interactive Pending Appeals Card with conditional routing */}
                    <div
                        onClick={() => {
                            if (user?.role === 'admin' || user?.role === 'moderator') {
                                navigate('/moderation');
                            }
                        }}
                        style={{
                            cursor: (user?.role === 'admin' || user?.role === 'moderator') ? 'pointer' : 'default',
                            transition: 'transform 0.15s ease'
                        }}
                        onMouseEnter={e => {
                            if (user?.role === 'admin' || user?.role === 'moderator') {
                                e.currentTarget.style.transform = 'translateY(-2px)'
                            }
                        }}
                        onMouseLeave={e => e.currentTarget.style.transform = 'none'}
                        title={(user?.role === 'admin' || user?.role === 'moderator') ? "Click to view QA Moderation Queue" : undefined}
                    >
                        <StatCard
                            icon={<Scale size={24} />}
                            title="Active Appeals"
                            value={pendingAppealsCount}
                            color={pendingAppealsCount > 0 ? "red" : "blue"}
                        />
                    </div>

                    <StatCard icon={<ShieldCheck size={24} />} title="Web3 Certificates Issued" value={securedCertificates} color="purple" />
                </div>
            </div>

            {/* ── TOP ROW CHARTS ── */}
            <div className="chart-row">

                {/* Formative Assessment Health */}
                <div className="chart-card">
                    <h3>Formative Assessment Health</h3>
                    <div className="chart-body">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={assessmentData} margin={{ top: 5, right: 30, left: -20, bottom: 5 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                                <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
                                <YAxis tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
                                <RechartsTooltip cursor={{ fill: '#f8fafc' }} contentStyle={tooltipStyle} />
                                <Legend verticalAlign="top" height={36} iconType="circle" wrapperStyle={{ fontSize: '12px' }} />
                                <Bar dataKey="Competent" stackId="a" fill="#10b981" radius={[0, 0, 4, 4]} />
                                <Bar dataKey="InProgress" stackId="a" fill="#3b82f6" name="In Progress" />
                                <Bar dataKey="NYC" stackId="a" fill="#ef4444" name="Not Yet Competent" radius={[4, 4, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Enrollments by Location */}
                <div className="chart-card">
                    <h3>Enrollments by Location</h3>
                    <div className="chart-body">
                        {campusData.length === 0 ? (
                            <div className="chart-card__empty">No active enrollments assigned to campuses.</div>
                        ) : (
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={campusData} margin={{ top: 5, right: 30, left: -20, bottom: 5 }}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                                    <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
                                    <YAxis tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
                                    <RechartsTooltip cursor={{ fill: '#f8fafc' }} contentStyle={tooltipStyle} />
                                    <Bar dataKey="learners" fill="#8b5cf6" radius={[4, 4, 0, 0]} maxBarSize={50} name="Active Learners" />
                                </BarChart>
                            </ResponsiveContainer>
                        )}
                    </div>
                </div>
            </div>

            {/* ── BOTTOM ROW CHARTS ── */}
            <div className="chart-row">

                {/* Cohort Lifecycle */}
                <div className="chart-card">
                    <h3>Cohort Lifecycle</h3>
                    <div className="chart-body">
                        {cohortLifecycleData.length === 0 ? (
                            <div className="chart-card__empty">No active cohorts found.</div>
                        ) : (
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie data={cohortLifecycleData} cx="50%" cy="45%" innerRadius={70} outerRadius={100} paddingAngle={2} dataKey="value">
                                        {cohortLifecycleData.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={entry.color} />
                                        ))}
                                    </Pie>
                                    <RechartsTooltip contentStyle={tooltipStyle} />
                                    <Legend verticalAlign="bottom" height={36} iconType="circle" />
                                </PieChart>
                            </ResponsiveContainer>
                        )}
                    </div>
                </div>

                {/* Certification Status */}
                <div className="chart-card">
                    <h3>Certification Status</h3>
                    <div className="chart-body">
                        {totalEnrollments === 0 ? (
                            <div className="chart-card__empty">No enrollments to certify yet.</div>
                        ) : (
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie data={web3Data} cx="50%" cy="45%" innerRadius={70} outerRadius={100} paddingAngle={2} dataKey="value">
                                        {web3Data.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={entry.color} />
                                        ))}
                                    </Pie>
                                    <RechartsTooltip contentStyle={tooltipStyle} />
                                    <Legend verticalAlign="bottom" height={36} iconType="circle" />
                                </PieChart>
                            </ResponsiveContainer>
                        )}
                    </div>
                </div>
            </div>

        </div>
    );
};