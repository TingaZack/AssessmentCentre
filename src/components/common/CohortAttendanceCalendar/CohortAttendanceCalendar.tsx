import React, { useMemo, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Calendar, ChevronLeft, ChevronRight, DownloadCloud, AlertTriangle, FileText } from 'lucide-react';
import moment from 'moment';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../../../lib/firebase';

// Import your Stipend Modal
import { StipendExportModal } from '../StipendExportModal/StipendExportModal';

interface CohortAttendanceCalendarProps {
    cohort: any;
    enrolledLearners: any[];
    dailyRegisters: any[];
    onSwitchToLedger: (date: string) => void;
}

export const CohortAttendanceCalendar: React.FC<CohortAttendanceCalendarProps> = ({
    cohort,
    enrolledLearners,
    dailyRegisters,
    onSwitchToLedger
}) => {
    const navigate = useNavigate();
    const [calendarMonth, setCalendarMonth] = useState(moment().startOf('month'));
    const [isStipendModalOpen, setIsStipendModalOpen] = useState(false);

    const [holidays, setHolidays] = useState<string[]>([]);
    const [cohortLeaves, setCohortLeaves] = useState<any[]>([]);

    const handlePrevMonth = () => setCalendarMonth(prev => prev.clone().subtract(1, 'month'));
    const handleNextMonth = () => setCalendarMonth(prev => prev.clone().add(1, 'month'));

    // 1. Fetch Holidays
    useEffect(() => {
        const fetchHolidays = async () => {
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
                    console.warn("Holiday API unreachable.");
                }
            }
        };
        fetchHolidays();
    }, []);

    // 2. Fetch Leave Requests
    useEffect(() => {
        if (!cohort?.id) return;
        const q = query(collection(db, 'leave_requests'), where('cohortId', '==', cohort.id));
        const unsub = onSnapshot(q, snap => {
            setCohortLeaves(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        });
        return () => unsub();
    }, [cohort?.id]);

    // 3. Generate Calendar Grid
    const calendarGrid = useMemo(() => {
        const startDay = calendarMonth.day();
        const diff = startDay === 0 ? 6 : startDay - 1;
        const startGrid = calendarMonth.clone().subtract(diff, 'days');

        const endOfMonth = calendarMonth.clone().endOf('month');
        const endDay = endOfMonth.day();
        const endDiff = endDay === 0 ? 0 : 7 - endDay;
        const endGrid = endOfMonth.clone().add(endDiff, 'days');

        const grid = [];
        let curr = startGrid.clone();
        while (curr.isSameOrBefore(endGrid)) {
            grid.push(curr.clone());
            curr.add(1, 'day');
        }
        return grid;
    }, [calendarMonth]);

    // 4. Map Data to Days
    const calendarDataMap = useMemo(() => {
        const map = new Map();

        holidays.forEach(h => map.set(h, { isHoliday: true }));

        if (cohort?.recessPeriods) {
            cohort.recessPeriods.forEach((p: any) => {
                let curr = moment(p.start);
                const end = moment(p.end);
                if (!curr.isValid() || !end.isValid()) return;
                let failsafe = 0;
                while (curr.isSameOrBefore(end) && failsafe < 60) {
                    const dStr = curr.format('YYYY-MM-DD');
                    map.set(dStr, { ...(map.get(dStr) || {}), isRecess: true, label: p.reason || 'Recess' });
                    curr.add(1, 'day');
                    failsafe++;
                }
            });
        }

        dailyRegisters.forEach(h => {
            if (!h.date) return;
            const dStr = moment(h.date).format('YYYY-MM-DD');
            const existing = map.get(dStr) || {};
            existing.hasRegister = true;
            existing.present = (existing.present || 0) + (h.presentLearners?.length || 0);
            existing.absent = (existing.absent || 0) + (h.absentLearners?.length || 0);
            map.set(dStr, existing);
        });

        cohortLeaves.forEach(l => {
            if (!l.startDate && !l.dateAffected) return;
            let curr = moment(l.startDate || l.dateAffected);
            const end = moment(l.endDate || l.dateAffected);
            if (!curr.isValid() || !end.isValid()) return;
            let failsafe = 0;
            while (curr.isSameOrBefore(end) && failsafe < 60) {
                const dStr = curr.format('YYYY-MM-DD');
                const existing = map.get(dStr) || {};
                existing.leaves = (existing.leaves || 0) + 1;
                if (l.status === 'Pending') existing.pendingLeaves = (existing.pendingLeaves || 0) + 1;
                map.set(dStr, existing);
                curr.add(1, 'day');
                failsafe++;
            }
        });

        return map;
    }, [dailyRegisters, holidays, cohort, cohortLeaves]);

    return (
        <div className="cdp-panel animate-fade-in" style={{ backgroundColor: 'white', padding: '1.5rem', borderRadius: '12px', border: '1px solid var(--mlab-border)', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)' }}>

            <StipendExportModal
                isOpen={isStipendModalOpen}
                onClose={() => setIsStipendModalOpen(false)}
                cohortId={cohort?.id || ''}
                cohortName={cohort?.name || 'Cohort'}
                learners={enrolledLearners.filter(l => l.status !== 'dropped')}
                attendanceMode="qcto"
                initialMonth={calendarMonth.format('YYYY-MM')}
            />

            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
                <h3 style={{ margin: 0, color: 'var(--mlab-midnight)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Calendar size={22} color="var(--mlab-blue)" />
                    Cohort Attendance Calendar
                </h3>

                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <button
                        className="mlab-btn mlab-btn--sm"
                        onClick={() => setIsStipendModalOpen(true)}
                        style={{ background: '#f0fdf4', color: '#166534', border: '1px solid #bbf7d0', fontWeight: 700 }}
                    >
                        <DownloadCloud size={14} /> Export {calendarMonth.format('MMM')} Stipends
                    </button>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', background: '#f8fafc', padding: '6px', borderRadius: '8px', border: '1px solid #cbd5e1' }}>
                        <button onClick={handlePrevMonth} style={{ padding: '6px', background: 'white', border: '1px solid #cbd5e1', borderRadius: '6px', cursor: 'pointer', display: 'flex' }}>
                            <ChevronLeft size={16} color="var(--mlab-midnight)" />
                        </button>
                        <span style={{ fontWeight: '800', width: '130px', textAlign: 'center', color: 'var(--mlab-midnight)' }}>
                            {calendarMonth.format('MMMM YYYY')}
                        </span>
                        <button onClick={handleNextMonth} style={{ padding: '6px', background: 'white', border: '1px solid #cbd5e1', borderRadius: '6px', cursor: 'pointer', display: 'flex' }}>
                            <ChevronRight size={16} color="var(--mlab-midnight)" />
                        </button>
                    </div>
                </div>
            </div>

            {/* Grid Header */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '10px', marginBottom: '10px' }}>
                {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => (
                    <div key={d} style={{ textAlign: 'center', fontWeight: '800', color: '#64748b', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{d}</div>
                ))}
            </div>

            {/* Grid Cells */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '10px', marginBottom: '2rem' }}>
                {calendarGrid.map((day) => {
                    const dateStr = day.format('YYYY-MM-DD');
                    const isCurrentMonth = day.month() === calendarMonth.month();
                    const isToday = dateStr === moment().format('YYYY-MM-DD');
                    const data = calendarDataMap.get(dateStr);

                    return (
                        <div
                            key={dateStr}
                            onClick={() => {
                                if (data?.hasRegister && cohort?.id) {
                                    navigate(`/facilitator/attendance/${cohort.id}?date=${dateStr}`);
                                } else {
                                    onSwitchToLedger(dateStr);
                                }
                            }}
                            style={{
                                border: isToday ? '2px solid var(--mlab-blue)' : '1px solid #e2e8f0',
                                borderRadius: '10px',
                                minHeight: '110px',
                                padding: '10px',
                                backgroundColor: isCurrentMonth ? 'white' : '#f8fafc',
                                opacity: isCurrentMonth ? 1 : 0.4,
                                cursor: data?.hasRegister ? 'pointer' : 'default',
                                transition: 'all 0.2s',
                                boxShadow: isToday ? '0 4px 12px rgba(7, 63, 78, 0.15)' : 'none'
                            }}
                            onMouseOver={e => { if (data?.hasRegister) e.currentTarget.style.borderColor = 'var(--mlab-green)' }}
                            onMouseOut={e => e.currentTarget.style.borderColor = isToday ? 'var(--mlab-blue)' : '#e2e8f0'}
                        >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{
                                    fontWeight: isToday ? '800' : '600',
                                    color: isToday ? 'white' : 'var(--mlab-midnight)',
                                    background: isToday ? 'var(--mlab-blue)' : 'transparent',
                                    width: '26px', height: '26px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%', fontSize: '0.85rem'
                                }}>{day.format('D')}</span>
                            </div>

                            {data && (
                                <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                    {data.isHoliday && <span style={{ fontSize: '0.65rem', background: '#e0f2fe', color: '#0284c7', padding: '3px 6px', borderRadius: '4px', fontWeight: 'bold' }}>Public Holiday</span>}
                                    {data.isRecess && <span style={{ fontSize: '0.65rem', background: '#f3e8ff', color: '#7e22ce', padding: '3px 6px', borderRadius: '4px', fontWeight: 'bold' }}>{data.label || 'Recess'}</span>}

                                    {data.hasRegister && (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', marginTop: '2px' }}>
                                            <span style={{ fontSize: '0.7rem', color: '#166534', background: '#dcfce7', padding: '3px 6px', borderRadius: '4px', fontWeight: 'bold' }}>{data.present} Present</span>
                                            {data.absent > 0 && <span style={{ fontSize: '0.7rem', color: '#991b1b', background: '#fee2e2', padding: '3px 6px', borderRadius: '4px', fontWeight: 'bold' }}>{data.absent} Absent</span>}
                                        </div>
                                    )}

                                    {data.leaves > 0 && (
                                        <span style={{ marginTop: '4px', fontSize: '0.7rem', background: data.pendingLeaves > 0 ? '#fef3c7' : '#f1f5f9', color: data.pendingLeaves > 0 ? '#b45309' : '#475569', padding: '3px 6px', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 'bold' }}>
                                            <FileText size={12} /> {data.leaves} Leave{data.leaves !== 1 ? 's' : ''}
                                        </span>
                                    )}
                                </div>
                            )}
                        </div>
                    )
                })}
            </div>
        </div>
    );
};