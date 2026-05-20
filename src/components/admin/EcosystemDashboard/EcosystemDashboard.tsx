// src/components/AdminPortal/EcosystemDashboard/EcosystemDashboard.tsx

import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { doc, collection, setDoc, updateDoc, onSnapshot, query, orderBy } from 'firebase/firestore';
import {
    Calendar, Users, Search, PlusCircle, QrCode,
    Settings, CheckCircle, Globe, Database, Copy, TrendingUp, Activity, Target, X, Save, Trash2, Archive, BarChart2, PieChart, Link2, Download, CheckSquare, Square
} from 'lucide-react';
import { db } from '../../../lib/firebase';
import Loader from '../../../components/common/Loader/Loader';
import { useToast } from '../../../components/common/Toast/Toast';
import { useStore } from '../../../store/useStore';
import * as XLSX from 'xlsx';

import { EventBuilderModal } from './EventBuilderModal';
import '../../../components/views/LearnersView/LearnersView.css';
import "../../../components/admin/LearnerFormModal/LearnerFormModal.css";
import type { EcosystemEvent } from '../../../types/ecosystem.types';
import { useNavigate } from 'react-router-dom';
import moment from 'moment';
import { StatusModal } from '../../common/StatusModal/StatusModal';

// ─── SMART DATE & CAPACITY HELPERS ───
const getEventDaysCount = (startIso: string, endIso?: string) => {
    if (!startIso) return 1;
    const start = new Date(startIso);
    const end = endIso ? new Date(endIso) : start;
    start.setHours(0, 0, 0, 0);
    end.setHours(0, 0, 0, 0);
    return Math.max(1, Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1);
};

const formatEventDuration = (startIso: string, endIso?: string) => {
    if (!startIso) return "Date TBD";
    const start = new Date(startIso);
    const end = endIso ? new Date(endIso) : start;
    const diffDays = getEventDaysCount(startIso, endIso);
    const startStr = start.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' });
    if (diffDays <= 1) return startStr;
    if (start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear()) {
        const monthYear = start.toLocaleDateString('en-ZA', { month: 'short', year: 'numeric' });
        return `${start.getDate()} – ${end.getDate()} ${monthYear} (${diffDays} Days)`;
    }
    const endStr = end.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' });
    return `${startStr} – ${endStr} (${diffDays} Days)`;
};

const getProgressColor = (percent: number) => {
    if (percent >= 100) return '#34d399';
    if (percent >= 75) return '#10b981';
    if (percent >= 40) return '#f59e0b';
    return '#ef4444';
};

const CHART_COLORS = ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ec4899', '#06b6d4', '#64748b'];

// ═════════════════════════════════════════════════════════════════════════════
// 🚀 STRICT LFM-STYLED TARGET ANALYTICS MODAL
// ═════════════════════════════════════════════════════════════════════════════
const TargetAnalyticsModal = ({ target, events, guests, checkins, onClose }: any) => {
    const { settings } = useStore();
    const toast = useToast();

    // 1. ISOLATE TARGET EVENTS
    const targetEvents = useMemo(() => {
        const kpiStart = moment(target.startDate).startOf('day');
        const kpiEnd = moment(target.endDate).endOf('day');
        const isStrictMode = target.linkedEvents?.length > 0 || events.some((ev: any) => ev.linkedTargets?.includes(target.id));

        return events.filter((e: any) => {
            if (isStrictMode) return target.linkedEvents?.includes(e.id) || e.linkedTargets?.includes(target.id);
            const hasNoLinks = !e.linkedTargets || e.linkedTargets.length === 0;
            return hasNoLinks && e.date && moment(e.date).isBetween(kpiStart, kpiEnd, 'day', '[]');
        });
    }, [target, events]);

    const targetEventIds = useMemo(() => targetEvents.map((e: any) => e.id), [targetEvents]);

    // 2. 🚀 NEW: GET ACTUAL CHECKINS FOR THESE EVENTS
    const validCheckins = useMemo(() => {
        return checkins.filter((c: any) => targetEventIds.includes(c.eventId));
    }, [checkins, targetEventIds]);

    // 3. IDENTIFY UNIQUE GUESTS
    const validGuests = useMemo(() => {
        const emailsWithValidCheckins = new Set(validCheckins.map((c: any) => c.guestEmail?.toLowerCase()));

        return guests.filter((g: any) => {
            // A. Strict match via event_checkins collection
            if (emailsWithValidCheckins.has(g.email?.toLowerCase())) return true;

            // B. Fallback time-bound matches
            const kpiStart = moment(target.startDate).startOf('day');
            const kpiEnd = moment(target.endDate).endOf('day');

            const lastSeen = moment(g.lastSeenAt);
            if (lastSeen.isValid() && lastSeen.isBetween(kpiStart, kpiEnd, 'day', '[]')) return true;

            const createdAt = moment(g.createdAt);
            if (createdAt.isValid() && createdAt.isBetween(kpiStart, kpiEnd, 'day', '[]')) return true;

            return false;
        });
    }, [guests, validCheckins, target]);

    // 🚀 4. MASTER FIELD DICTIONARY (Completely eliminates duplication & spacing issues)
    const masterFieldDictionary = useMemo(() => {
        const dict: Record<string, string> = {
            'gender': 'Gender',
            'sex': 'Gender',
            'race': 'Race',
            'equity': 'Race',
            'ethnicity': 'Race',
            'disability': 'Disability',
            'disabilities': 'Disability'
        };

        // Absorb Global Settings (Capitalize them properly)
        const globalDemos = (settings as any)?.globalDemographicFields || ["gender", "race", "disability"];
        globalDemos.forEach((f: string) => {
            const squashedKey = f.toLowerCase().trim().replace(/[^a-z0-9]/g, '');
            if (!dict[squashedKey]) {
                dict[squashedKey] = f.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()); // e.g. "highest_education" -> "Highest Education"
            }
        });

        // Absorb Event Blueprints (Creates human-readable labels from hidden IDs)
        events.forEach((e: any) => {
            if (e.guestFormBlueprint) {
                e.guestFormBlueprint.forEach((f: any) => {
                    if (f.id && f.label) {
                        dict[f.id] = f.label.trim(); // Map field_123 -> Label
                        const squashed = f.label.toLowerCase().trim().replace(/[^a-z0-9]/g, '');
                        dict[squashed] = f.label.trim(); // Map squashedlabel -> Label
                    }
                });
            }
        });

        return dict;
    }, [events, settings]);

    // 5. UNIFIED AVAILABLE FIELDS (Extracts purely formatted labels)
    const availableFields = useMemo(() => {
        const labels = new Set<string>();

        // A. Add Global Demographics
        const globalDemos = (settings as any)?.globalDemographicFields || ["gender", "race", "disability"];
        globalDemos.forEach((f: string) => {
            const squashed = f.toLowerCase().trim().replace(/[^a-z0-9]/g, '');
            labels.add(masterFieldDictionary[squashed] || f);
        });

        // B. Add Event-Specific Fields
        targetEvents.forEach((event: any) => {
            if (event.guestFormBlueprint) {
                event.guestFormBlueprint.forEach((field: any) => {
                    if (field.label) labels.add(field.label.trim());
                });
            }
        });

        // C. Check Event Check-in Collection keys
        validCheckins.forEach((c: any) => {
            if (c.responses) {
                Object.keys(c.responses).forEach(k => {
                    const squashed = k.toLowerCase().trim().replace(/[^a-z0-9]/g, '');
                    labels.add(masterFieldDictionary[k] || masterFieldDictionary[squashed] || k);
                });
            }
        });

        // D. Catch Trapped/Legacy Data in Guests Root
        validGuests.forEach((g: any) => {
            if (g.customFields) {
                Object.keys(g.customFields).forEach(k => {
                    const squashed = k.toLowerCase().trim().replace(/[^a-z0-9]/g, '');
                    labels.add(masterFieldDictionary[k] || masterFieldDictionary[squashed] || k);
                });
            }
            if (g.gender) labels.add('Gender');
            if (g.race) labels.add('Race');
            if (g.disability) labels.add('Disability');
        });

        return Array.from(labels).sort();
    }, [validGuests, validCheckins, targetEvents, settings, masterFieldDictionary]);

    // 🚀 6. BULLETPROOF OMNI-EXTRACTOR
    const extractStrictFieldValue = (guest: any, targetDisplayLabel: string) => {
        // This function determines if a raw database key matches the requested Display Label
        const isMatch = (rawKey: string) => {
            if (rawKey === targetDisplayLabel) return true;
            if (rawKey.toLowerCase().trim() === targetDisplayLabel.toLowerCase().trim()) return true;

            const squashed = rawKey.toLowerCase().trim().replace(/[^a-z0-9]/g, '');
            if (masterFieldDictionary[rawKey] === targetDisplayLabel) return true;
            if (masterFieldDictionary[squashed] === targetDisplayLabel) return true;

            // Strict Demographic Overrides
            const targetLower = targetDisplayLabel.toLowerCase();
            if (targetLower === 'gender' || targetLower === 'sex') {
                if (['sex', 'gender', 'gendercode'].includes(squashed)) return true;
            }
            if (targetLower === 'race' || targetLower === 'equity' || targetLower === 'ethnicity') {
                if (['race', 'equity', 'ethnicity', 'equitycode'].includes(squashed)) return true;
            }
            if (targetLower === 'disability' || targetLower.includes('any disability')) {
                if (['disability', 'disabilities', 'anydisability', 'disabilitystatus', 'anydisabilities'].includes(squashed)) return true;
            }

            return false;
        };

        // A. Search ROOT guest profile
        for (const key of Object.keys(guest)) {
            if (isMatch(key) && guest[key] !== undefined && String(guest[key]).trim() !== "") return String(guest[key]);
        }

        // B. Search inside separate event_checkins collection 🚀
        const guestCheckins = validCheckins.filter((c: any) => c.guestEmail?.toLowerCase() === guest.email?.toLowerCase());
        // Sort to get most recent answer
        guestCheckins.sort((a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

        for (const record of guestCheckins) {
            if (record.responses) {
                for (const key of Object.keys(record.responses)) {
                    if (isMatch(key) && record.responses[key] !== undefined && String(record.responses[key]).trim() !== "") {
                        return String(record.responses[key]);
                    }
                }
            }
        }

        // C. Fallback to guest.customFields
        if (guest.customFields) {
            for (const key of Object.keys(guest.customFields)) {
                if (isMatch(key) && guest.customFields[key] !== undefined && String(guest.customFields[key]).trim() !== "") {
                    return String(guest.customFields[key]);
                }
            }
        }

        // D. Deep Dive into legacy attendanceHistory array
        if (guest.attendanceHistory && Array.isArray(guest.attendanceHistory)) {
            const sortedHistory = [...guest.attendanceHistory].sort((a, b) =>
                new Date(b.attendedAt || b.timestamp || 0).getTime() - new Date(a.attendedAt || a.timestamp || 0).getTime()
            );
            for (const record of sortedHistory) {
                if (record.responses) {
                    for (const key of Object.keys(record.responses)) {
                        if (isMatch(key) && record.responses[key] !== undefined && String(record.responses[key]).trim() !== "") {
                            return String(record.responses[key]);
                        }
                    }
                }
            }
        }

        return null;
    };

    // State for checked items
    const [selectedFields, setSelectedFields] = useState<string[]>([]);

    // On mount, auto-select all available fields so they are ready for export
    useEffect(() => {
        if (availableFields.length > 0 && selectedFields.length === 0) {
            setSelectedFields(availableFields);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [availableFields]);

    const toggleField = (field: string) => {
        setSelectedFields(prev => prev.includes(field) ? prev.filter(f => f !== field) : [...prev, field]);
    };

    // 🚀 EXCEL EXPORT (NOW STRICTLY EXPORTS SELECTED FIELDS)
    const handleExportReport = () => {
        if (validGuests.length === 0) {
            toast.warning("No attendance data found to export for this target's date range.");
            return;
        }

        if (selectedFields.length === 0) {
            toast.warning("Please check at least one field to export.");
            return;
        }

        const exportData = validGuests.map((g: any) => {
            const baseRecord: any = {
                "First Name": g.firstName || "",
                "Last Name": g.lastName || "",
                "Email Address": g.email || "",
                "Mobile Number": g.phone || "",
            };

            // ONLY push data for fields the user explicitly checked
            selectedFields.forEach(field => {
                const val = extractStrictFieldValue(g, field);
                baseRecord[field] = val || "N/A";
            });

            return baseRecord;
        });

        const worksheet = XLSX.utils.json_to_sheet(exportData);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Impact Report");

        const cleanTitle = target.title.replace(/[^a-zA-Z0-9]/g, '_');
        XLSX.writeFile(workbook, `${cleanTitle}_Impact_Data.xlsx`);
    };

    // Calculation for Target Display
    const targetGoal = target.targetAmount || 1;
    const currentProgress = target.kpiTotalProgress || 0;
    const remaining = Math.max(0, targetGoal - currentProgress);

    return (
        <div className="lfm-overlay" onClick={onClose} style={{ zIndex: 9999 }}>
            <div className="lfm-modal animate-fade-in" onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: '1100px', height: '85vh', display: 'flex', flexDirection: 'column' }}>

                {/* ── HEADER ── */}
                <div className="lfm-header">
                    <div style={{ flex: 1 }}>
                        <h2 className="lfm-header__title"><BarChart2 size={16} /> Impact Analysis: {target.title}</h2>
                        <p style={{ margin: '4px 0 0 28px', fontSize: '0.75rem', color: 'rgba(255,255,255,0.7)', fontFamily: 'var(--font-body)' }}>
                            Analyzing <strong>{validGuests.length}</strong> unique guests exactly between <strong>{moment(target.startDate).format('D MMM YYYY')}</strong> and <strong>{moment(target.endDate).format('D MMM YYYY')}</strong>
                        </p>

                        {/* 🚀 TARGET METRICS BADGE */}
                        <div style={{ margin: '12px 0 0 28px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <div style={{ background: 'rgba(255,255,255,0.15)', padding: '4px 10px', borderRadius: '4px', fontSize: '0.8rem', fontWeight: 700, color: '#fff', letterSpacing: '0.05em' }}>
                                🎯 {currentProgress.toLocaleString()} / {targetGoal.toLocaleString()}
                            </div>
                            <div style={{ fontSize: '0.75rem', color: '#a7f3d0', fontWeight: 600 }}>
                                {remaining > 0 ? `${remaining.toLocaleString()} to go to reach your goal` : '🎉 Goal Achieved!'}
                            </div>
                        </div>
                    </div>
                    <button className="lfm-close-btn" onClick={onClose}><X size={20} /></button>
                </div>

                {/* ── BODY (SPLIT VIEW) ── */}
                <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

                    {/* LEFT SIDEBAR: FIELD SELECTOR */}
                    <div style={{ width: '280px', background: 'var(--mlab-light-blue)', borderRight: '2px solid var(--mlab-border)', padding: '1.5rem', overflowY: 'auto' }}>

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', borderBottom: '1px solid var(--mlab-border)', paddingBottom: '0.75rem' }}>
                            <div className="lfm-section-hdr" style={{ margin: 0, border: 'none', padding: 0 }}>
                                <Settings size={13} /> Fields to Analyze
                            </div>
                        </div>

                        {/* SELECT ALL / DESELECT ALL ACTION ROW */}
                        <div style={{ display: 'flex', gap: '8px', marginBottom: '1rem' }}>
                            <button
                                type="button"
                                onClick={() => setSelectedFields(availableFields)}
                                style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', background: 'white', border: '1px solid var(--mlab-border)', padding: '4px 8px', fontSize: '0.65rem', fontWeight: 600, color: 'var(--mlab-blue)', borderRadius: '4px', cursor: 'pointer' }}
                            >
                                <CheckSquare size={12} /> Select All
                            </button>
                            <button
                                type="button"
                                onClick={() => setSelectedFields([])}
                                style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', background: 'white', border: '1px solid var(--mlab-border)', padding: '4px 8px', fontSize: '0.65rem', fontWeight: 600, color: 'var(--mlab-grey)', borderRadius: '4px', cursor: 'pointer' }}
                            >
                                <Square size={12} /> Clear All
                            </button>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                            {availableFields.map(field => {
                                const isChecked = selectedFields.includes(field);
                                return (
                                    <label key={field} className="lfm-checkbox-row" style={{
                                        background: isChecked ? 'var(--mlab-white)' : 'transparent',
                                        padding: '0.6rem',
                                        border: `1px solid ${isChecked ? 'var(--mlab-blue)' : 'transparent'}`,
                                        transition: 'all 0.15s',
                                        borderRadius: '4px'
                                    }}>
                                        <input type="checkbox" checked={isChecked} onChange={() => toggleField(field)} />
                                        <span style={{
                                            fontWeight: isChecked ? 700 : 600,
                                            color: isChecked ? 'var(--mlab-blue)' : 'var(--mlab-grey)',
                                            textTransform: 'uppercase',
                                            fontSize: '0.7rem',
                                            letterSpacing: '0.05em'
                                        }}>
                                            {field}
                                        </span>
                                    </label>
                                );
                            })}
                        </div>
                    </div>

                    {/* RIGHT AREA: CHARTS */}
                    <div style={{ flex: 1, padding: '1.5rem', overflowY: 'auto', background: 'var(--mlab-bg)' }}>
                        {selectedFields.length === 0 ? (
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--mlab-grey-lt)', fontFamily: 'var(--font-heading)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                                <PieChart size={48} style={{ opacity: 0.3, marginBottom: '1rem', color: 'var(--mlab-blue)' }} />
                                <p>Select fields from the left to build your report</p>
                            </div>
                        ) : (
                            <div className="lfm-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))' }}>
                                {selectedFields.map((field) => {
                                    const counts: Record<string, number> = {};
                                    let totalValid = 0;

                                    validGuests.forEach((guest: any) => {
                                        const val = extractStrictFieldValue(guest, field);
                                        // ONLY GRAPH ACTUAL SUBMITTED DATA (IGNORES NULLS)
                                        if (val) {
                                            const norm = val.trim();
                                            counts[norm] = (counts[norm] || 0) + 1;
                                            totalValid++;
                                        }
                                    });

                                    const series = Object.entries(counts)
                                        .map(([label, count]) => ({ label, count, percent: Math.round((count / totalValid) * 100) }))
                                        .sort((a, b) => b.count - a.count);

                                    return (
                                        <div key={field} className="lfm-demographics-panel" style={{ background: 'var(--mlab-white)', border: '1px solid var(--mlab-border)', borderLeft: '4px solid var(--mlab-blue)', padding: '1.25rem' }}>
                                            <div className="lfm-section-hdr" style={{ borderBottom: '1px solid var(--mlab-border)', paddingBottom: '0.5rem', marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <span style={{ textTransform: 'uppercase' }}><Database size={13} style={{ display: 'inline', marginRight: '4px', color: 'var(--mlab-green)' }} /> {field}</span>
                                                <span style={{ fontSize: '0.65rem', color: 'var(--mlab-grey)', background: 'var(--mlab-bg)', padding: '2px 6px', border: '1px solid var(--mlab-border)' }}>n = {totalValid}</span>
                                            </div>

                                            {series.length === 0 ? (
                                                <p style={{ fontSize: '0.8rem', color: 'var(--mlab-grey-lt)', fontStyle: 'italic', fontFamily: 'var(--font-body)' }}>No exact responses recorded in this window.</p>
                                            ) : (
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                                                    {series.map((item, idx) => (
                                                        <div key={item.label}>
                                                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: '4px', fontFamily: 'var(--font-body)' }}>
                                                                <span style={{ color: 'var(--mlab-blue)', fontWeight: 600 }}>{item.label}</span>
                                                                <span style={{ color: 'var(--mlab-grey)' }}>{item.count} <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--mlab-blue)' }}>({item.percent}%)</span></span>
                                                            </div>
                                                            <div style={{ height: '8px', background: 'var(--mlab-bg)', border: '1px solid var(--mlab-border)', overflow: 'hidden' }}>
                                                                <div style={{ width: `${item.percent}%`, height: '100%', background: CHART_COLORS[idx % CHART_COLORS.length] }} />
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>

                {/* ── FOOTER ── */}
                <div className="lfm-footer" style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
                    <button
                        className="lfm-btn lfm-btn--ghost"
                        onClick={handleExportReport}
                        style={{ borderColor: 'var(--mlab-green)', color: 'var(--mlab-green-dark)' }}
                        disabled={selectedFields.length === 0}
                    >
                        <Download size={14} /> Export Checked Data
                    </button>
                    <button className="lfm-btn lfm-btn--ghost" onClick={onClose}>
                        Close Report
                    </button>
                </div>
            </div>
        </div>
    );
};

// ═════════════════════════════════════════════════════════════════════════════
// 🚀 MAIN DASHBOARD COMPONENT
// ═════════════════════════════════════════════════════════════════════════════
export const EcosystemDashboard: React.FC = () => {
    const toast = useToast();
    const { programmes, user } = useStore();
    const navigate = useNavigate();

    const isSuperAdmin = (user as any)?.isSuperAdmin === true;

    // ─── TABS & LOADING STATE ───
    const [activeTab, setActiveTab] = useState<'events' | 'guests'>('events');
    const [isLoading, setIsLoading] = useState(true);

    // ─── MODAL STATES ───
    const [showEventModal, setShowEventModal] = useState(false);
    const [selectedEvent, setSelectedEvent] = useState<EcosystemEvent | null>(null);
    const [showKpiModal, setShowKpiModal] = useState(false);
    const [analyticsTarget, setAnalyticsTarget] = useState<any | null>(null);

    // ─── DUAL-ACTION STATES ───
    const [targetToArchive, setTargetToArchive] = useState<string | null>(null);
    const [targetToDelete, setTargetToDelete] = useState<string | null>(null);

    // ─── DATA STATES ───
    const [events, setEvents] = useState<EcosystemEvent[]>([]);
    const [guests, setGuests] = useState<any[]>([]);
    const [checkins, setCheckins] = useState<any[]>([]); // 🚀 NEW: Checkins state
    const [searchTerm, setSearchTerm] = useState('');
    const [targets, setTargets] = useState<any[]>([]);
    const [kpiForm, setKpiForm] = useState<any>(null);
    const [kpiEventSearch, setKpiEventSearch] = useState('');

    useEffect(() => {
        setIsLoading(true);

        const eventsQuery = query(collection(db, 'events'), orderBy('date', 'desc'));
        const unsubscribeEvents = onSnapshot(eventsQuery, (snapshot) => {
            const fetchedEvents = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as EcosystemEvent[];
            setEvents(fetchedEvents);
            setIsLoading(false);
        }, (error) => {
            console.error("Error fetching events:", error);
            setIsLoading(false);
        });

        const guestsQuery = query(collection(db, 'ecosystem_guests'), orderBy('lastSeenAt', 'desc'));
        const unsubscribeGuests = onSnapshot(guestsQuery, (snapshot) => {
            const fetchedGuests = snapshot.docs.map(doc => ({ email: doc.id, ...doc.data() }));
            setGuests(fetchedGuests);
        });

        // 🚀 NEW: Fetch Checkins Collection
        const checkinsQuery = query(collection(db, 'event_checkins'), orderBy('timestamp', 'desc'));
        const unsubscribeCheckins = onSnapshot(checkinsQuery, (snapshot) => {
            const fetchedCheckins = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setCheckins(fetchedCheckins);
        });

        const unsubscribeSettings = onSnapshot(doc(db, 'system_settings', 'ecosystem_kpi'), (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                setTargets(data.targets || []);
            } else {
                setTargets([]);
            }
        });

        return () => {
            unsubscribeEvents();
            unsubscribeGuests();
            unsubscribeCheckins(); // 🚀 Clean up listener
            unsubscribeSettings();
        };
    }, []);

    // ─── EVENT HANDLERS ───
    const handleSaveEvent = async (eventData: Partial<EcosystemEvent>) => {
        try {
            const isEdit = !!selectedEvent?.id;
            const eventRef = isEdit ? doc(db, 'events', selectedEvent.id) : doc(collection(db, 'events'));
            const payload: any = { ...eventData, updatedAt: new Date().toISOString() };

            if (isEdit) {
                await updateDoc(eventRef, payload);
                toast.success("Event updated successfully!");
            } else {
                payload.id = eventRef.id;
                payload.createdBy = user?.uid || 'admin';
                payload.currentCheckIns = 0;
                payload.status = 'active';
                payload.createdAt = new Date().toISOString();
                await setDoc(eventRef, payload);
                toast.success("Event created successfully!");
            }
            setShowEventModal(false);
            setSelectedEvent(null);
        } catch (error: any) {
            console.error("Failed to save event:", error);
        }
    };

    const handleDuplicateEvent = (eventToCopy: EcosystemEvent) => {
        const { id, currentCheckIns, createdAt, updatedAt, status, createdBy, ...clonedData } = eventToCopy as any;
        const newEventDraft = { ...clonedData, eventName: `${clonedData.eventName} (Copy)` } as EcosystemEvent;
        setSelectedEvent(newEventDraft);
        setShowEventModal(true);
    };

    // ─── KPI TARGET HANDLERS ───
    const openKpiModal = (targetData?: any) => {
        setKpiEventSearch('');
        if (targetData) {
            setKpiForm({ ...targetData, linkedEvents: targetData.linkedEvents || [] });
        } else {
            setKpiForm({
                id: `target_${Date.now()}`, title: "New Impact Target",
                startDate: moment().startOf('year').format('YYYY-MM-DD'),
                endDate: moment().endOf('year').format('YYYY-MM-DD'),
                targetAmount: 1000, offlineCarryover: 0, isArchived: false, linkedEvents: []
            });
        }
        setShowKpiModal(true);
    };

    const handleSaveKpi = async () => {
        try {
            const existingIndex = targets.findIndex(t => t.id === kpiForm.id);
            let updatedTargets = [...targets];
            if (existingIndex >= 0) updatedTargets[existingIndex] = kpiForm;
            else updatedTargets.push(kpiForm);

            await setDoc(doc(db, 'system_settings', 'ecosystem_kpi'), { targets: updatedTargets }, { merge: true });
            toast.success("Impact Target saved successfully.");
            setShowKpiModal(false);
        } catch (error) {
            console.error("Failed to save target config:", error);
            toast.error("Failed to update target.");
        }
    };

    const executeArchiveKpi = async () => {
        if (!targetToArchive) return;
        try {
            const updatedTargets = targets.map(t => t.id === targetToArchive ? { ...t, isArchived: true } : t);
            await setDoc(doc(db, 'system_settings', 'ecosystem_kpi'), { targets: updatedTargets }, { merge: true });
            toast.success("Impact Target archived.");
        } catch (error) { console.error(error); } finally { setTargetToArchive(null); }
    };

    const executeDeleteKpi = async () => {
        if (!targetToDelete) return;
        try {
            const updatedTargets = targets.filter(t => t.id !== targetToDelete);
            await setDoc(doc(db, 'system_settings', 'ecosystem_kpi'), { targets: updatedTargets }, { merge: true });
            toast.success("Impact Target deleted.");
        } catch (error) { console.error(error); } finally { setTargetToDelete(null); }
    };

    // ─── SMART METRICS ───
    const calculatedTargets = useMemo(() => {
        return targets
            .filter(t => !t.isArchived)
            .map(target => {
                const kpiStart = moment(target.startDate).startOf('day');
                const kpiEnd = moment(target.endDate).endOf('day');
                const targetHasExplicitEvents = target.linkedEvents && target.linkedEvents.length > 0;
                const isStrictMode = targetHasExplicitEvents || events.some(ev => ev.linkedTargets?.includes(target.id));

                let kpiWindowImpact = 0;
                events.forEach(e => {
                    const checkins = e.currentCheckIns || 0;
                    let countsTowardsTarget = false;

                    if (isStrictMode) {
                        const isExplicitlyLinked = (target.linkedEvents && target.linkedEvents.includes(e.id)) || (e.linkedTargets && e.linkedTargets.includes(target.id));
                        if (isExplicitlyLinked) countsTowardsTarget = true;
                    } else {
                        const hasNoLinks = !e.linkedTargets || e.linkedTargets.length === 0;
                        if (hasNoLinks && e.date && moment(e.date).isBetween(kpiStart, kpiEnd, 'day', '[]')) countsTowardsTarget = true;
                    }
                    if (countsTowardsTarget) kpiWindowImpact += checkins;
                });

                const kpiTotalProgress = kpiWindowImpact + (Number(target.offlineCarryover) || 0);
                const targetGoal = Number(target.targetAmount) || 1;
                const progressPercent = Math.min(100, Math.round((kpiTotalProgress / targetGoal) * 100));

                return { ...target, kpiTotalProgress, targetGoal, progressPercent, isStrictMode };
            }).sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
    }, [events, targets]);

    const { allTimeImpact, averageCapacity } = useMemo(() => {
        let impact = 0;
        let validCapacityEvents = 0;
        let totalCapacityPercentage = 0;

        events.forEach(e => {
            impact += (e.currentCheckIns || 0);
            if (e.maxCapacity && e.maxCapacity > 0) {
                const diffDays = getEventDaysCount(e.date, (e as any).endDate);
                const dailyCheckins = diffDays > 1 ? Math.round((e.currentCheckIns || 0) / diffDays) : (e.currentCheckIns || 0);
                totalCapacityPercentage += (dailyCheckins / e.maxCapacity);
                validCapacityEvents++;
            }
        });

        return {
            allTimeImpact: impact,
            averageCapacity: validCapacityEvents > 0 ? Math.round((totalCapacityPercentage / validCapacityEvents) * 100) : 0
        };
    }, [events]);

    const filteredEvents = events.filter(e => e.eventName.toLowerCase().includes(searchTerm.toLowerCase()) || e.location.toLowerCase().includes(searchTerm.toLowerCase()));
    const filteredGuests = guests.filter(g => (g.firstName + ' ' + g.lastName).toLowerCase().includes(searchTerm.toLowerCase()) || g.email.toLowerCase().includes(searchTerm.toLowerCase()));
    const filteredKpiModalEvents = events.filter(e => e.eventName.toLowerCase().includes(kpiEventSearch.toLowerCase()));

    if (isLoading) {
        return <div className="att-loader-wrap"><Loader message="Loading Ecosystem Data…" /></div>;
    }

    return (
        <div className="att-root animate-fade-in">
            {/* BUILDER & STATUS MODALS */}
            {showEventModal && createPortal(<EventBuilderModal event={selectedEvent} programmes={programmes} availableTargets={targets.filter(t => !t.isArchived)} onClose={() => { setShowEventModal(false); setSelectedEvent(null); }} onSave={handleSaveEvent} />, document.body)}
            {targetToArchive && createPortal(<StatusModal type="warning" title="Archive Target?" message="This will hide the target from the dashboard, but all check-in data remains perfectly intact." confirmText="Yes, Archive It" onClose={executeArchiveKpi} onCancel={() => setTargetToArchive(null)} />, document.body)}
            {targetToDelete && createPortal(<StatusModal type="error" title="Delete Target?" message="DANGER: Are you absolutely sure you want to permanently delete this Ecosystem Target?" confirmText="Permanently Delete" onClose={executeDeleteKpi} onCancel={() => setTargetToDelete(null)} />, document.body)}

            {/* 🚀 LFM-STYLED DEEP DIVE ANALYTICS MODAL WITH EVENT CHECKINS */}
            {analyticsTarget && createPortal(
                <TargetAnalyticsModal target={analyticsTarget} events={events} guests={guests} checkins={checkins} onClose={() => setAnalyticsTarget(null)} />,
                document.body
            )}

            {/* ─── LFM-STYLED TARGET SETTINGS MODAL ─── */}
            {showKpiModal && kpiForm && createPortal(
                <div className="lfm-overlay" onClick={() => setShowKpiModal(false)} style={{ zIndex: 999 }}>
                    <div className="lfm-modal animate-fade-in" onClick={e => e.stopPropagation()} style={{ maxWidth: '550px' }}>
                        <div className="lfm-header">
                            <h2 className="lfm-header__title"><Target size={16} /> Configure Impact Target</h2>
                            <button className="lfm-close-btn" onClick={() => setShowKpiModal(false)}><X size={20} /></button>
                        </div>

                        <div className="lfm-body">
                            <div className="lfm-section-hdr"><Settings size={13} /> General Properties</div>
                            <div className="lfm-grid">
                                <div className="lfm-fg lfm-fg--full">
                                    <label>Target Name / Title *</label>
                                    <input type="text" className="lfm-input" value={kpiForm.title} onChange={e => setKpiForm({ ...kpiForm, title: e.target.value })} placeholder="e.g. FY26 Ecosystem Impact" />
                                </div>
                                <div className="lfm-fg">
                                    <label>Start Date</label>
                                    <input type="date" className="lfm-input" value={kpiForm.startDate} onChange={e => setKpiForm({ ...kpiForm, startDate: e.target.value })} />
                                </div>
                                <div className="lfm-fg">
                                    <label>End Date</label>
                                    <input type="date" className="lfm-input" value={kpiForm.endDate} onChange={e => setKpiForm({ ...kpiForm, endDate: e.target.value })} />
                                </div>
                                <div className="lfm-fg">
                                    <label>Target Goal Amount</label>
                                    <input type="number" className="lfm-input" value={kpiForm.targetAmount} onChange={e => setKpiForm({ ...kpiForm, targetAmount: Number(e.target.value) })} />
                                </div>
                                <div className="lfm-fg">
                                    <label>Offline Base Impact</label>
                                    <input type="number" className="lfm-input" value={kpiForm.offlineCarryover} onChange={e => setKpiForm({ ...kpiForm, offlineCarryover: Number(e.target.value) })} />
                                </div>
                            </div>

                            <div className="lfm-section-hdr" style={{ marginTop: '1rem' }}><Link2 size={13} /> Explicitly Link Events</div>
                            <div className="lfm-flags-panel" style={{ background: 'var(--mlab-bg)', border: '1px solid var(--mlab-border)', borderLeft: '4px solid var(--mlab-blue)' }}>
                                <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.8rem', color: 'var(--mlab-grey)', margin: '0 0 10px 0', lineHeight: 1.4 }}>
                                    If you select events here, this target will <strong>only</strong> track these specific events. Leave blank to auto-absorb any event within the date range above.
                                </p>

                                <div className="mlab-search" style={{ marginBottom: '12px', background: 'var(--mlab-white)', border: '1px solid var(--mlab-border)', padding: '4px 10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <Search size={14} color="var(--mlab-grey)" />
                                    <input type="text" placeholder="Search events to link..." value={kpiEventSearch} onChange={(e) => setKpiEventSearch(e.target.value)} style={{ border: 'none', outline: 'none', background: 'transparent', width: '100%', fontSize: '0.85rem', fontFamily: 'var(--font-body)' }} />
                                </div>

                                <div style={{ maxHeight: '160px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px', paddingRight: '4px' }}>
                                    {events.length === 0 && <span style={{ fontSize: '0.8rem', color: 'var(--mlab-grey-lt)', fontFamily: 'var(--font-body)' }}>No events available yet.</span>}
                                    {filteredKpiModalEvents.map(e => {
                                        const isChecked = kpiForm.linkedEvents?.includes(e.id);
                                        return (
                                            <label key={e.id} className="lfm-checkbox-row" style={{ background: isChecked ? 'var(--mlab-white)' : 'transparent', padding: '8px 10px', border: `1px solid ${isChecked ? 'var(--mlab-blue)' : 'var(--mlab-border)'}`, transition: 'all 0.1s' }}>
                                                <input type="checkbox" checked={isChecked} onChange={(ev) => {
                                                    const newLinks = ev.target.checked ? [...(kpiForm.linkedEvents || []), e.id] : (kpiForm.linkedEvents || []).filter((id: string) => id !== e.id);
                                                    setKpiForm({ ...kpiForm, linkedEvents: newLinks });
                                                }} />
                                                <div style={{ flex: 1 }}>
                                                    <div style={{ fontWeight: 700, color: 'var(--mlab-blue)', fontSize: '0.8rem' }}>{e.eventName}</div>
                                                    <div style={{ color: 'var(--mlab-grey)', fontSize: '0.7rem' }}>{moment(e.date).format('DD MMM YYYY')}</div>
                                                </div>
                                            </label>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>

                        <div className="lfm-footer" style={{ display: 'flex', justifyContent: targets.some(t => t.id === kpiForm.id) && isSuperAdmin ? 'space-between' : 'flex-end' }}>
                            {targets.some(t => t.id === kpiForm.id) && isSuperAdmin && (
                                <div style={{ display: 'flex', gap: '8px' }}>
                                    <button type="button" className="lfm-btn lfm-btn--ghost" style={{ borderColor: 'var(--mlab-red)', color: 'var(--mlab-red)' }} onClick={() => { setShowKpiModal(false); setTargetToDelete(kpiForm.id); }} title="Permanently Delete"><Trash2 size={13} /></button>
                                    <button type="button" className="lfm-btn lfm-btn--ghost" onClick={() => { setShowKpiModal(false); setTargetToArchive(kpiForm.id); }} title="Archive"><Archive size={13} /> Archive</button>
                                </div>
                            )}
                            <div style={{ display: 'flex', gap: '8px' }}>
                                <button className="lfm-btn lfm-btn--ghost" onClick={() => setShowKpiModal(false)}>Cancel</button>
                                <button className="lfm-btn lfm-btn--primary" onClick={handleSaveKpi}><Save size={13} /> Save Target</button>
                            </div>
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {/* ─── HEADER TABS ─── */}
            <div className="att-tabs" role="tablist">
                <button role="tab" className={`att-tab${activeTab === 'events' ? ' att-tab--active' : ''}`} onClick={() => { setActiveTab('events'); setSearchTerm(''); }}>
                    <Calendar size={14} /> Ecosystem Events
                </button>
                <button role="tab" className={`att-tab${activeTab === 'guests' ? ' att-tab--active' : ''}`} onClick={() => { setActiveTab('guests'); setSearchTerm(''); }}>
                    <Database size={14} /> Guest CRM Ledger
                </button>
            </div>

            {/* 🚀 HORIZONTAL KPI TARGET SCROLL 🚀 */}
            <div style={{ display: 'flex', gap: '1rem', overflowX: 'auto', paddingBottom: '1rem', marginBottom: '0.5rem', scrollbarWidth: 'none' }}>
                {calculatedTargets.map(t => {
                    const dynamicColor = getProgressColor(t.progressPercent);
                    return (
                        <div key={t.id} style={{ minWidth: '360px', flex: '0 0 auto', background: '#0f172a', padding: '1.5rem', color: 'white', position: 'relative', overflow: 'hidden', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)' }}>
                            <div style={{ position: 'absolute', right: '-10%', top: '-20%', opacity: 0.05 }}><Target size={180} color="white" /></div>

                            <div style={{ position: 'relative', zIndex: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                <div style={{ flex: 1 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                                        <div style={{ background: 'rgba(255,255,255,0.1)', padding: '4px 10px', borderRadius: '20px', fontSize: '0.7rem', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                                            {moment(t.startDate).format('D MMM YYYY')} — {moment(t.endDate).format('D MMM YYYY')}
                                        </div>
                                        {t.isStrictMode && <div style={{ background: 'rgba(56, 189, 248, 0.2)', color: '#38bdf8', padding: '4px 8px', borderRadius: '20px', fontSize: '0.65rem', fontWeight: 700 }}>Strict Mode</div>}
                                    </div>
                                    <h2 style={{ margin: '0 0 1rem 0', fontSize: '1.25rem', fontWeight: 700, fontFamily: 'var(--font-heading)' }}>{t.title}</h2>

                                    <div style={{ marginBottom: '10px' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', alignItems: 'flex-end' }}>
                                            <div style={{ fontSize: '2.2rem', fontWeight: 800, lineHeight: 1, fontFamily: 'var(--font-heading)', color: dynamicColor }}>
                                                {t.kpiTotalProgress.toLocaleString()} <span style={{ fontSize: '1.1rem', color: '#94a3b8', fontWeight: 600 }}>/ {t.targetGoal.toLocaleString()}</span>
                                            </div>
                                            <div style={{ fontSize: '1rem', fontWeight: 700, color: 'white' }}>{t.progressPercent}%</div>
                                        </div>

                                        <div style={{ height: '10px', background: 'rgba(255,255,255,0.1)', borderRadius: '5px', overflow: 'hidden' }}>
                                            <div style={{ width: `${t.progressPercent}%`, height: '100%', background: dynamicColor, borderRadius: '5px', transition: 'width 1s ease-in-out' }} />
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* 🚀 ACTION BUTTONS ROW */}
                            <div style={{ display: 'flex', gap: '8px', marginTop: '1rem', position: 'relative', zIndex: 10 }}>
                                <button onClick={() => setAnalyticsTarget(t)} style={{ flex: 1, background: 'var(--mlab-blue)', border: 'none', color: 'white', padding: '8px 12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem', borderRadius: '6px' }}>
                                    <BarChart2 size={14} /> Analyze Impact
                                </button>
                                <button onClick={() => openKpiModal(t)} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: 'white', padding: '8px 12px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', borderRadius: '6px' }}>
                                    <Settings size={14} />
                                </button>
                            </div>
                        </div>
                    );
                })}

                <button onClick={() => openKpiModal()} style={{ minWidth: '180px', flex: '0 0 auto', background: '#f8fafc', border: '2px dashed #cbd5e1', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--mlab-grey)', cursor: 'pointer', gap: '8px', padding: '2rem' }}>
                    <PlusCircle size={28} />
                    <span style={{ fontWeight: 600, fontSize: '0.9rem', textAlign: 'center' }}>Add Impact Target</span>
                </button>
            </div>

            {/* ─── 4-COLUMN STAT CARDS (GLOBAL TOTALS) ─── */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
                <div style={{ background: 'white', padding: '1.25rem', border: '1px solid var(--mlab-border)', borderLeft: '4px solid #8b5cf6', display: 'flex', alignItems: 'center', gap: '1rem', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.02)' }}>
                    <div style={{ background: '#ede9fe', padding: '12px', borderRadius: '50%' }}><TrendingUp size={24} color="#8b5cf6" /></div>
                    <div>
                        <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--mlab-grey)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>All-Time App Impact</p>
                        <h3 style={{ margin: '4px 0 0', color: '#8b5cf6', fontSize: '1.5rem', fontFamily: 'var(--font-heading)' }}>{allTimeImpact.toLocaleString()} <span style={{ fontSize: '0.85rem', color: 'var(--mlab-grey)' }}>Engagements</span></h3>
                    </div>
                </div>

                <div style={{ background: 'white', padding: '1.25rem', border: '1px solid var(--mlab-border)', borderLeft: '4px solid var(--mlab-blue)', display: 'flex', alignItems: 'center', gap: '1rem', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.02)' }}>
                    <div style={{ background: 'var(--mlab-light-blue)', padding: '12px', borderRadius: '50%' }}><Globe size={24} color="var(--mlab-blue)" /></div>
                    <div>
                        <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--mlab-grey)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Events</p>
                        <h3 style={{ margin: '4px 0 0', color: 'var(--mlab-blue)', fontSize: '1.5rem', fontFamily: 'var(--font-heading)' }}>{events.length} <span style={{ fontSize: '0.85rem', color: 'var(--mlab-grey)' }}>Hosted</span></h3>
                    </div>
                </div>

                <div style={{ background: 'white', padding: '1.25rem', border: '1px solid var(--mlab-border)', borderLeft: '4px solid var(--mlab-green)', display: 'flex', alignItems: 'center', gap: '1rem', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.02)' }}>
                    <div style={{ background: 'var(--mlab-green-bg)', padding: '12px', borderRadius: '50%' }}><Users size={24} color="var(--mlab-green-dark)" /></div>
                    <div>
                        <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--mlab-grey)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Unique Guests</p>
                        <h3 style={{ margin: '4px 0 0', color: 'var(--mlab-green-dark)', fontSize: '1.5rem', fontFamily: 'var(--font-heading)' }}>{guests.length} <span style={{ fontSize: '0.85rem', color: 'var(--mlab-grey)' }}>Profiles</span></h3>
                    </div>
                </div>

                <div style={{ background: 'white', padding: '1.25rem', border: '1px solid var(--mlab-border)', borderLeft: '4px solid #f59e0b', display: 'flex', alignItems: 'center', gap: '1rem', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.02)' }}>
                    <div style={{ background: '#fef3c7', padding: '12px', borderRadius: '50%' }}><Activity size={24} color="#d97706" /></div>
                    <div>
                        <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--mlab-grey)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Average Capacity</p>
                        <h3 style={{ margin: '4px 0 0', color: '#d97706', fontSize: '1.5rem', fontFamily: 'var(--font-heading)' }}>{averageCapacity}% <span style={{ fontSize: '0.85rem', color: 'var(--mlab-grey)' }}>Fill Rate</span></h3>
                    </div>
                </div>
            </div>

            {/* ─── SEARCH & TOOLBAR ─── */}
            <div className="mlab-toolbar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.5rem' }}>
                <div className="mlab-search" style={{ minWidth: '250px', background: '#f8fafc', height: 35, borderRadius: 0, border: '1px solid var(--mlab-border)', padding: '4px 12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Search size={18} color="var(--mlab-grey)" />
                    <input
                        type="text"
                        placeholder={activeTab === 'events' ? "Search events or locations..." : "Search guests by name or email..."}
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        style={{ border: 'none', outline: 'none', background: 'transparent', width: '100%' }}
                    />
                </div>

                {activeTab === 'events' && (
                    <button className="mlab-btn mlab-btn--primary" onClick={() => { setSelectedEvent(null); setShowEventModal(true); }}>
                        <PlusCircle size={16} /> Create New Event
                    </button>
                )}
            </div>

            {/* ─── EVENTS TAB CONTENT ─── */}
            {activeTab === 'events' && (
                <div className="mlab-table-wrap">
                    <table className="mlab-table">
                        <thead>
                            <tr>
                                <th>Event Name & Date</th>
                                <th>Location</th>
                                <th>Capacity</th>
                                <th>Custom Fields</th>
                                <th className="att-th--right">Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredEvents.length > 0 ? filteredEvents.map(event => {
                                const diffDays = getEventDaysCount(event.date, (event as any).endDate);
                                const totalCheckins = event.currentCheckIns || 0;
                                const displayCheckins = diffDays > 1 ? Math.round(totalCheckins / diffDays) : totalCheckins;
                                const capacityLabel = diffDays > 1 ? 'Avg/Day' : 'Checked In';

                                const capacityPercent = event.maxCapacity ? Math.round((displayCheckins / event.maxCapacity) * 100) : 0;
                                let badgeBg = '#ecfccb', badgeColor = '#65a30d', badgeBorder = '#d9f99d';

                                if (capacityPercent >= 100) { badgeBg = '#fee2e2'; badgeColor = '#dc2626'; badgeBorder = '#fecaca'; }
                                else if (capacityPercent >= 80) { badgeBg = '#fef3c7'; badgeColor = '#d97706'; badgeBorder = '#fde68a'; }

                                return (
                                    <tr key={event.id}>
                                        <td>
                                            <div style={{ fontWeight: 600, color: 'var(--mlab-blue)' }}>{event.eventName}</div>
                                            {event.eventType && <div style={{ fontSize: '0.7rem', color: 'var(--mlab-green)', fontWeight: 'bold', textTransform: 'uppercase', marginTop: '2px' }}>{event.eventType}</div>}
                                            <div style={{ fontSize: '0.75rem', color: 'var(--mlab-grey)', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '4px' }}><Calendar size={12} color="#94a3b8" />{formatEventDuration(event.date, (event as any).endDate)}</div>
                                        </td>
                                        <td><div style={{ fontSize: '0.85rem' }}>{event.location.split(',')[0]}</div></td>
                                        <td>
                                            <span className="att-badge" style={{ background: badgeBg, color: badgeColor, border: `1px solid ${badgeBorder}` }}>
                                                {displayCheckins} / {event.maxCapacity} {capacityLabel}
                                            </span>
                                            {diffDays > 1 && <div style={{ fontSize: '0.65rem', color: 'var(--mlab-grey)', marginTop: '4px', textAlign: 'center', fontWeight: 500 }}>{totalCheckins} Total Scans</div>}
                                        </td>
                                        <td><span style={{ fontSize: '0.75rem', color: 'var(--mlab-grey)' }}>{event.guestFormBlueprint?.length || 0} Extra Question(s)</span></td>
                                        <td className="att-td--right">
                                            <button className="cdp-btn cdp-btn--sky" onClick={() => { setSelectedEvent(event); setShowEventModal(true); }} title="Edit Event"><Settings size={14} /></button>
                                            <button className="cdp-btn cdp-btn--outline" style={{ marginLeft: 8 }} onClick={() => handleDuplicateEvent(event)} title="Duplicate Event"><Copy size={14} /></button>
                                            <button className="cdp-btn cdp-btn--outline" style={{ marginLeft: 8, paddingLeft: 12, paddingRight: 12 }} onClick={() => navigate(`/admin/ecosystem/event/${event.id}`)}><Users size={14} /> Roster</button>
                                            <button className="mlab-btn mlab-btn--sm" style={{ marginLeft: '8px', background: 'var(--mlab-blue)', color: 'white' }} onClick={() => window.open(`/event-kiosk/${event.id}`, '_blank')} title="Open TV Kiosk"><QrCode size={14} /></button>
                                        </td>
                                    </tr>
                                );
                            }) : (
                                <tr><td colSpan={5} style={{ padding: '3rem', textAlign: 'center', color: 'var(--mlab-grey)' }}>No events found. Click "Create New Event" to get started.</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            )}

            {/* ─── GUESTS TAB CONTENT ─── */}
            {activeTab === 'guests' && (
                <div className="mlab-table-wrap">
                    <table className="mlab-table">
                        <thead>
                            <tr>
                                <th>Guest Name</th>
                                <th>Email Address</th>
                                <th>Mobile</th>
                                <th>Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredGuests.length > 0 ? filteredGuests.map(guest => (
                                <tr key={guest.email}>
                                    <td><div style={{ fontWeight: 600 }}>{guest.firstName} {guest.lastName}</div></td>
                                    <td>{guest.email}</td>
                                    <td>{guest.phone}</td>
                                    <td><span className="att-badge att-badge--present"><CheckCircle size={11} /> Verified CRM Profile</span></td>
                                </tr>
                            )) : (
                                <tr><td colSpan={4} style={{ padding: '3rem', textAlign: 'center', color: 'var(--mlab-grey)' }}>No guests found. Data will populate once visitors start checking in.</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
};



// // src/components/AdminPortal/EcosystemDashboard/EcosystemDashboard.tsx

// import React, { useState, useEffect, useMemo } from 'react';
// import { createPortal } from 'react-dom';
// import { doc, collection, setDoc, updateDoc, onSnapshot, query, orderBy } from 'firebase/firestore';
// import {
//     Calendar, Users, Search, PlusCircle, QrCode,
//     Settings, CheckCircle, Globe, Database, Copy, TrendingUp, Activity, Target, X, Save, Edit3, Trash2, Archive, Link2
// } from 'lucide-react';
// import { db } from '../../../lib/firebase';
// import Loader from '../../../components/common/Loader/Loader';
// import { useToast } from '../../../components/common/Toast/Toast';
// import { useStore } from '../../../store/useStore';

// import { EventBuilderModal } from './EventBuilderModal';

// import '../../../components/views/LearnersView/LearnersView.css';
// import "../../../pages/FacilitatorDashboard/AttendanceRegister/AttendanceHistoryList.css";
// import type { EcosystemEvent } from '../../../types/ecosystem.types';
// import { useNavigate } from 'react-router-dom';
// import moment from 'moment';
// import { StatusModal } from '../../common/StatusModal/StatusModal';

// // ─── SMART DATE & CAPACITY HELPERS ───

// const getEventDaysCount = (startIso: string, endIso?: string) => {
//     if (!startIso) return 1;
//     const start = new Date(startIso);
//     const end = endIso ? new Date(endIso) : start;

//     start.setHours(0, 0, 0, 0);
//     end.setHours(0, 0, 0, 0);

//     return Math.max(1, Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1);
// };

// const formatEventDuration = (startIso: string, endIso?: string) => {
//     if (!startIso) return "Date TBD";
//     const start = new Date(startIso);
//     const end = endIso ? new Date(endIso) : start;

//     const diffDays = getEventDaysCount(startIso, endIso);
//     const startStr = start.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' });

//     if (diffDays <= 1) return startStr;

//     if (start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear()) {
//         const monthYear = start.toLocaleDateString('en-ZA', { month: 'short', year: 'numeric' });
//         return `${start.getDate()} – ${end.getDate()} ${monthYear} (${diffDays} Days)`;
//     }

//     const endStr = end.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' });
//     return `${startStr} – ${endStr} (${diffDays} Days)`;
// };

// // 🚀 NEW: Dynamic Color Helper for Progress Bars
// const getProgressColor = (percent: number) => {
//     if (percent >= 100) return '#34d399'; // Bright Mint (Target Hit!)
//     if (percent >= 75) return '#10b981';  // Emerald Green (Almost there)
//     if (percent >= 40) return '#f59e0b';  // Amber (Making progress)
//     return '#ef4444';                     // Red (Just started / Behind)
// };

// const DEFAULT_KPI = {
//     title: "FY26/27 Ecosystem Impact Goal",
//     startDate: moment().startOf('year').format('YYYY-MM-DD'),
//     endDate: moment().endOf('year').format('YYYY-MM-DD'),
//     targetAmount: 1000,
//     offlineCarryover: 0,
//     isArchived: false,
//     linkedEvents: []
// };

// export const EcosystemDashboard: React.FC = () => {
//     const toast = useToast();
//     const { programmes, user } = useStore();
//     const navigate = useNavigate();

//     const isSuperAdmin = (user as any)?.isSuperAdmin === true;

//     // ─── TABS & LOADING STATE ───
//     const [activeTab, setActiveTab] = useState<'events' | 'guests'>('events');
//     const [isLoading, setIsLoading] = useState(true);

//     // ─── MODAL STATES ───
//     const [showEventModal, setShowEventModal] = useState(false);
//     const [selectedEvent, setSelectedEvent] = useState<EcosystemEvent | null>(null);
//     const [showKpiModal, setShowKpiModal] = useState(false);

//     // 🚀 DUAL-ACTION STATES
//     const [targetToArchive, setTargetToArchive] = useState<string | null>(null);
//     const [targetToDelete, setTargetToDelete] = useState<string | null>(null);

//     // ─── DATA STATES ───
//     const [events, setEvents] = useState<EcosystemEvent[]>([]);
//     const [guests, setGuests] = useState<any[]>([]);
//     const [searchTerm, setSearchTerm] = useState('');
//     const [targets, setTargets] = useState<any[]>([]);
//     const [kpiForm, setKpiForm] = useState<any>(null);

//     const [kpiEventSearch, setKpiEventSearch] = useState('');

//     useEffect(() => {
//         setIsLoading(true);

//         const eventsQuery = query(collection(db, 'events'), orderBy('date', 'desc'));
//         const unsubscribeEvents = onSnapshot(eventsQuery, (snapshot) => {
//             const fetchedEvents = snapshot.docs.map(doc => ({
//                 id: doc.id,
//                 ...doc.data()
//             })) as EcosystemEvent[];
//             setEvents(fetchedEvents);
//             setIsLoading(false);
//         }, (error) => {
//             console.error("Error fetching events:", error);
//             toast.error("Failed to load ecosystem events.");
//             setIsLoading(false);
//         });

//         const guestsQuery = query(collection(db, 'ecosystem_guests'), orderBy('lastSeenAt', 'desc'));
//         const unsubscribeGuests = onSnapshot(guestsQuery, (snapshot) => {
//             const fetchedGuests = snapshot.docs.map(doc => ({
//                 email: doc.id,
//                 ...doc.data()
//             }));
//             setGuests(fetchedGuests);
//         });

//         const unsubscribeKpi = onSnapshot(doc(db, 'system_settings', 'ecosystem_kpi'), (docSnap) => {
//             if (docSnap.exists()) {
//                 const data = docSnap.data();
//                 setTargets(data.targets || []);
//             } else {
//                 setTargets([]);
//             }
//         });

//         return () => {
//             unsubscribeEvents();
//             unsubscribeGuests();
//             unsubscribeKpi();
//         };
//         // eslint-disable-next-line react-hooks/exhaustive-deps
//     }, []);

//     // ─── EVENT HANDLERS ───
//     const handleSaveEvent = async (eventData: Partial<EcosystemEvent>) => {
//         try {
//             const isEdit = !!selectedEvent?.id;
//             const eventRef = isEdit
//                 ? doc(db, 'events', selectedEvent.id)
//                 : doc(collection(db, 'events'));

//             const payload: any = {
//                 ...eventData,
//                 updatedAt: new Date().toISOString(),
//             };

//             if (isEdit) {
//                 await updateDoc(eventRef, payload);
//                 toast.success("Event updated successfully!");
//             } else {
//                 payload.id = eventRef.id;
//                 payload.createdBy = user?.uid || 'admin';
//                 payload.currentCheckIns = 0;
//                 payload.status = 'active';
//                 payload.createdAt = new Date().toISOString();

//                 await setDoc(eventRef, payload);
//                 toast.success("Event created successfully!");
//             }

//             setShowEventModal(false);
//             setSelectedEvent(null);

//         } catch (error: any) {
//             console.error("Failed to save event:", error);
//             throw error;
//         }
//     };

//     const handleDuplicateEvent = (eventToCopy: EcosystemEvent) => {
//         const { id, currentCheckIns, createdAt, updatedAt, status, createdBy, ...clonedData } = eventToCopy as any;
//         const newEventDraft = {
//             ...clonedData,
//             eventName: `${clonedData.eventName} (Copy)`
//         } as EcosystemEvent;
//         setSelectedEvent(newEventDraft);
//         setShowEventModal(true);
//     };

//     // ─── KPI TARGET HANDLERS ───
//     const openKpiModal = (targetData?: any) => {
//         setKpiEventSearch('');

//         if (targetData) {
//             setKpiForm({ ...targetData, linkedEvents: targetData.linkedEvents || [] });
//         } else {
//             setKpiForm({
//                 id: `target_${Date.now()}`,
//                 title: "New Impact Target",
//                 startDate: moment().startOf('year').format('YYYY-MM-DD'),
//                 endDate: moment().endOf('year').format('YYYY-MM-DD'),
//                 targetAmount: 1000,
//                 offlineCarryover: 0,
//                 isArchived: false,
//                 linkedEvents: []
//             });
//         }
//         setShowKpiModal(true);
//     };

//     const handleSaveKpi = async () => {
//         try {
//             const existingIndex = targets.findIndex(t => t.id === kpiForm.id);
//             let updatedTargets = [...targets];

//             if (existingIndex >= 0) {
//                 updatedTargets[existingIndex] = kpiForm;
//             } else {
//                 updatedTargets.push(kpiForm);
//             }

//             await setDoc(doc(db, 'system_settings', 'ecosystem_kpi'), { targets: updatedTargets }, { merge: true });
//             toast.success("Impact Target saved successfully.");
//             setShowKpiModal(false);
//         } catch (error) {
//             console.error("Failed to save target config:", error);
//             toast.error("Failed to update target.");
//         }
//     };

//     const executeArchiveKpi = async () => {
//         if (!targetToArchive) return;
//         try {
//             const updatedTargets = targets.map(t => t.id === targetToArchive ? { ...t, isArchived: true } : t);
//             await setDoc(doc(db, 'system_settings', 'ecosystem_kpi'), { targets: updatedTargets }, { merge: true });
//             toast.success("Impact Target successfully archived.");
//         } catch (error) {
//             console.error("Failed to archive target:", error);
//             toast.error("Failed to archive target.");
//         } finally {
//             setTargetToArchive(null);
//         }
//     };

//     const executeDeleteKpi = async () => {
//         if (!targetToDelete) return;
//         try {
//             const updatedTargets = targets.filter(t => t.id !== targetToDelete);
//             await setDoc(doc(db, 'system_settings', 'ecosystem_kpi'), { targets: updatedTargets }, { merge: true });
//             toast.success("Impact Target permanently deleted.");
//         } catch (error) {
//             console.error("Failed to delete target:", error);
//             toast.error("Failed to delete target.");
//         } finally {
//             setTargetToDelete(null);
//         }
//     };

//     // ─── SMART BI-DIRECTIONAL METRICS CALCULATION ───
//     const calculatedTargets = useMemo(() => {
//         return targets
//             .filter(t => !t.isArchived)
//             .map(target => {
//                 const kpiStart = moment(target.startDate).startOf('day');
//                 const kpiEnd = moment(target.endDate).endOf('day');
//                 const targetHasExplicitEvents = target.linkedEvents && target.linkedEvents.length > 0;

//                 const isStrictMode = targetHasExplicitEvents || events.some(ev => ev.linkedTargets?.includes(target.id));

//                 let kpiWindowImpact = 0;

//                 events.forEach(e => {
//                     const checkins = e.currentCheckIns || 0;

//                     let countsTowardsTarget = false;

//                     if (isStrictMode) {
//                         const isExplicitlyLinked = (target.linkedEvents && target.linkedEvents.includes(e.id)) ||
//                             (e.linkedTargets && e.linkedTargets.includes(target.id));
//                         if (isExplicitlyLinked) {
//                             countsTowardsTarget = true;
//                         }
//                     } else {
//                         const hasNoLinks = !e.linkedTargets || e.linkedTargets.length === 0;
//                         if (hasNoLinks && e.date && moment(e.date).isBetween(kpiStart, kpiEnd, 'day', '[]')) {
//                             countsTowardsTarget = true;
//                         }
//                     }

//                     if (countsTowardsTarget) {
//                         kpiWindowImpact += checkins;
//                     }
//                 });

//                 const kpiTotalProgress = kpiWindowImpact + (Number(target.offlineCarryover) || 0);
//                 const targetGoal = Number(target.targetAmount) || 1;
//                 const progressPercent = Math.min(100, Math.round((kpiTotalProgress / targetGoal) * 100));

//                 return { ...target, kpiTotalProgress, targetGoal, progressPercent, isStrictMode };
//             }).sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
//     }, [events, targets]);

//     const { allTimeImpact, averageCapacity } = useMemo(() => {
//         let impact = 0;
//         let validCapacityEvents = 0;
//         let totalCapacityPercentage = 0;

//         events.forEach(e => {
//             impact += (e.currentCheckIns || 0);
//             if (e.maxCapacity && e.maxCapacity > 0) {
//                 const diffDays = getEventDaysCount(e.date, (e as any).endDate);
//                 const dailyCheckins = diffDays > 1 ? Math.round((e.currentCheckIns || 0) / diffDays) : (e.currentCheckIns || 0);
//                 totalCapacityPercentage += (dailyCheckins / e.maxCapacity);
//                 validCapacityEvents++;
//             }
//         });

//         return {
//             allTimeImpact: impact,
//             averageCapacity: validCapacityEvents > 0 ? Math.round((totalCapacityPercentage / validCapacityEvents) * 100) : 0
//         };
//     }, [events]);

//     const filteredEvents = events.filter(e =>
//         e.eventName.toLowerCase().includes(searchTerm.toLowerCase()) ||
//         e.location.toLowerCase().includes(searchTerm.toLowerCase()) ||
//         (e.eventType && e.eventType.toLowerCase().includes(searchTerm.toLowerCase()))
//     );

//     const filteredGuests = guests.filter(g =>
//         (g.firstName + ' ' + g.lastName).toLowerCase().includes(searchTerm.toLowerCase()) ||
//         g.email.toLowerCase().includes(searchTerm.toLowerCase())
//     );

//     const filteredKpiModalEvents = events.filter(e =>
//         e.eventName.toLowerCase().includes(kpiEventSearch.toLowerCase())
//     );

//     if (isLoading) {
//         return (
//             <div className="att-loader-wrap">
//                 <Loader message="Loading Ecosystem Data…" />
//             </div>
//         );
//     }

//     return (
//         <div className="att-root animate-fade-in">

//             {showEventModal && createPortal(
//                 <EventBuilderModal
//                     event={selectedEvent}
//                     programmes={programmes}
//                     availableTargets={targets.filter(t => !t.isArchived)}
//                     onClose={() => {
//                         setShowEventModal(false);
//                         setSelectedEvent(null);
//                     }}
//                     onSave={handleSaveEvent}
//                 />,
//                 document.body
//             )}

//             {targetToArchive && createPortal(
//                 <StatusModal
//                     type="warning"
//                     title="Archive Impact Target?"
//                     message="Are you sure you want to archive this Ecosystem Target? It will be hidden from the dashboard, but all check-in data and historical links remain perfectly intact in the database."
//                     confirmText="Yes, Archive It"
//                     onClose={executeArchiveKpi}
//                     onCancel={() => setTargetToArchive(null)}
//                 />,
//                 document.body
//             )}

//             {targetToDelete && createPortal(
//                 <StatusModal
//                     type="error"
//                     title="Permanently Delete Target?"
//                     message="DANGER: Are you absolutely sure you want to permanently delete this Ecosystem Target? This action cannot be undone and the card will be wiped from the system."
//                     confirmText="Yes, Permanently Delete"
//                     onClose={executeDeleteKpi}
//                     onCancel={() => setTargetToDelete(null)}
//                 />,
//                 document.body
//             )}

//             {/* ─── TARGET SETTINGS MODAL ─── */}
//             {showKpiModal && kpiForm && createPortal(
//                 <div className="lfm-overlay" onClick={() => setShowKpiModal(false)} style={{ zIndex: 999 }}>
//                     <div className="lfm-modal animate-fade-in" onClick={e => e.stopPropagation()} style={{ maxWidth: '500px' }}>
//                         <div className="lfm-header">
//                             <h2 className="lfm-header__title"><Target size={16} /> Configure Impact Target</h2>
//                             <button className="lfm-close-btn" onClick={() => setShowKpiModal(false)}><X size={20} /></button>
//                         </div>
//                         <div className="lfm-body" style={{ padding: '1.5rem', background: '#f8fafc' }}>
//                             <div className="mlab-form-group mb-4">
//                                 <label>Target Name / Title</label>
//                                 <input type="text" className="mlab-input bg-white" value={kpiForm.title} onChange={e => setKpiForm({ ...kpiForm, title: e.target.value })} placeholder="e.g. FY26 Ecosystem Impact" />
//                             </div>
//                             <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
//                                 <div className="mlab-form-group" style={{ flex: 1 }}>
//                                     <label>Start Date</label>
//                                     <input type="date" className="mlab-input bg-white" value={kpiForm.startDate} onChange={e => setKpiForm({ ...kpiForm, startDate: e.target.value })} />
//                                 </div>
//                                 <div className="mlab-form-group" style={{ flex: 1 }}>
//                                     <label>End Date</label>
//                                     <input type="date" className="mlab-input bg-white" value={kpiForm.endDate} onChange={e => setKpiForm({ ...kpiForm, endDate: e.target.value })} />
//                                 </div>
//                             </div>
//                             <div style={{ display: 'flex', gap: '1rem' }}>
//                                 <div className="mlab-form-group" style={{ flex: 1 }}>
//                                     <label>Target Goal Amount</label>
//                                     <input type="number" className="mlab-input bg-white" value={kpiForm.targetAmount} onChange={e => setKpiForm({ ...kpiForm, targetAmount: Number(e.target.value) })} />
//                                 </div>
//                                 <div className="mlab-form-group" style={{ flex: 1 }}>
//                                     <label>Offline Base Impact</label>
//                                     <input type="number" className="mlab-input bg-white" value={kpiForm.offlineCarryover} onChange={e => setKpiForm({ ...kpiForm, offlineCarryover: Number(e.target.value) })} />
//                                 </div>
//                             </div>

//                             <div style={{ background: 'white', border: '1px solid #cbd5e1', padding: '1rem', marginTop: '1.5rem', borderRadius: '8px' }}>
//                                 <h4 style={{ display: 'flex', alignItems: 'center', gap: '6px', margin: '0 0 4px 0', fontSize: '0.85rem', color: 'var(--mlab-midnight)' }}>
//                                     <Link2 size={14} /> Explicitly Link Events
//                                 </h4>
//                                 <p style={{ fontSize: '0.75rem', color: 'var(--mlab-grey)', margin: '0 0 10px 0', lineHeight: 1.4 }}>
//                                     If you select events here, this target will <strong>only</strong> track these specific events. Leave blank to auto-absorb any event within the date range above.
//                                 </p>

//                                 <div className="mlab-search" style={{ marginBottom: '12px', background: '#f8fafc', border: '1px solid #e2e8f0', padding: '4px 10px', display: 'flex', alignItems: 'center', gap: '8px', borderRadius: '6px' }}>
//                                     <Search size={14} color="#94a3b8" />
//                                     <input
//                                         type="text"
//                                         placeholder="Search events to link..."
//                                         value={kpiEventSearch}
//                                         onChange={(e) => setKpiEventSearch(e.target.value)}
//                                         style={{ border: 'none', outline: 'none', background: 'transparent', width: '100%', fontSize: '0.75rem' }}
//                                     />
//                                 </div>

//                                 <div style={{ maxHeight: '160px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px', paddingRight: '4px' }}>
//                                     {events.length === 0 && <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>No events available yet.</span>}
//                                     {events.length > 0 && filteredKpiModalEvents.length === 0 && (
//                                         <span style={{ fontSize: '0.75rem', color: '#94a3b8', fontStyle: 'italic', textAlign: 'center', padding: '1rem 0' }}>
//                                             No events match "{kpiEventSearch}"
//                                         </span>
//                                     )}
//                                     {filteredKpiModalEvents.map(e => {
//                                         const isChecked = kpiForm.linkedEvents?.includes(e.id);
//                                         return (
//                                             <label key={e.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem', background: isChecked ? '#f0f9ff' : '#f8fafc', padding: '8px 10px', border: `1px solid ${isChecked ? '#7dd3fc' : '#e2e8f0'}`, cursor: 'pointer', transition: 'all 0.1s', borderRadius: '6px' }}>
//                                                 <input
//                                                     type="checkbox"
//                                                     checked={isChecked}
//                                                     onChange={(ev) => {
//                                                         const newLinks = ev.target.checked
//                                                             ? [...(kpiForm.linkedEvents || []), e.id]
//                                                             : (kpiForm.linkedEvents || []).filter((id: string) => id !== e.id);
//                                                         setKpiForm({ ...kpiForm, linkedEvents: newLinks });
//                                                     }}
//                                                     style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: 'var(--mlab-blue)' }}
//                                                 />
//                                                 <div style={{ flex: 1 }}>
//                                                     <div style={{ fontWeight: 600, color: 'var(--mlab-blue)' }}>{e.eventName}</div>
//                                                     <div style={{ color: '#94a3b8', fontSize: '0.7rem' }}>{moment(e.date).format('DD MMM YYYY')}</div>
//                                                 </div>
//                                             </label>
//                                         );
//                                     })}
//                                 </div>
//                             </div>

//                         </div>

//                         <div className="lfm-footer" style={{ display: 'flex', justifyContent: targets.some(t => t.id === kpiForm.id) && isSuperAdmin ? 'space-between' : 'flex-end' }}>
//                             {targets.some(t => t.id === kpiForm.id) && isSuperAdmin && (
//                                 <div style={{ display: 'flex', gap: '8px' }}>
//                                     <button
//                                         type="button"
//                                         style={{ color: '#ef4444', background: 'rgba(239, 68, 68, 0.1)', border: 'none', padding: '8px 12px', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
//                                         onClick={() => {
//                                             setShowKpiModal(false);
//                                             setTargetToDelete(kpiForm.id);
//                                         }}
//                                         title="Permanently Delete"
//                                     >
//                                         <Trash2 size={16} />
//                                     </button>
//                                     <button
//                                         type="button"
//                                         style={{ color: '#f59e0b', background: 'rgba(245, 158, 11, 0.1)', border: 'none', padding: '8px 12px', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', fontWeight: 600 }}
//                                         onClick={() => {
//                                             setShowKpiModal(false);
//                                             setTargetToArchive(kpiForm.id);
//                                         }}
//                                         title="Archive (Hide from Dashboard)"
//                                     >
//                                         <Archive size={14} style={{ marginRight: '6px' }} /> Archive
//                                     </button>
//                                 </div>
//                             )}
//                             <div style={{ display: 'flex', gap: '8px' }}>
//                                 <button className="lfm-btn lfm-btn--ghost" onClick={() => setShowKpiModal(false)}>Cancel</button>
//                                 <button className="lfm-btn lfm-btn--primary" onClick={handleSaveKpi}><Save size={14} /> Save Target</button>
//                             </div>
//                         </div>
//                     </div>
//                 </div>,
//                 document.body
//             )}

//             {/* ─── HEADER TABS ─── */}
//             <div className="att-tabs" role="tablist">
//                 <button
//                     role="tab"
//                     className={`att-tab${activeTab === 'events' ? ' att-tab--active' : ''}`}
//                     onClick={() => { setActiveTab('events'); setSearchTerm(''); }}
//                 >
//                     <Calendar size={14} /> Ecosystem Events
//                 </button>
//                 <button
//                     role="tab"
//                     className={`att-tab${activeTab === 'guests' ? ' att-tab--active' : ''}`}
//                     onClick={() => { setActiveTab('guests'); setSearchTerm(''); }}
//                 >
//                     <Database size={14} /> Guest CRM Ledger
//                 </button>
//             </div>

//             {/* 🚀 HORIZONTAL KPI TARGET SCROLL 🚀 */}
//             <div style={{ display: 'flex', gap: '1rem', overflowX: 'auto', paddingBottom: '1rem', marginBottom: '0.5rem', scrollbarWidth: 'none' }}>
//                 {calculatedTargets.map(t => {
//                     const dynamicColor = getProgressColor(t.progressPercent); // 🚀 Apply color logic

//                     return (
//                         <div key={t.id} style={{ minWidth: '350px', flex: '0 0 auto', background: '#0f172a', padding: '1.5rem', color: 'white', position: 'relative', overflow: 'hidden', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)' }}>
//                             <div style={{ position: 'absolute', right: '-10%', top: '-20%', opacity: 0.05 }}><Target size={180} color="white" /></div>

//                             <div style={{ position: 'relative', zIndex: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
//                                 <div style={{ flex: 1 }}>
//                                     <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
//                                         <div style={{ background: 'rgba(255,255,255,0.1)', padding: '4px 10px', borderRadius: '20px', fontSize: '0.7rem', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
//                                             {moment(t.startDate).format('D MMM YYYY')} — {moment(t.endDate).format('D MMM YYYY')}
//                                         </div>
//                                         {t.isStrictMode && (
//                                             <div style={{ background: 'rgba(56, 189, 248, 0.2)', color: '#38bdf8', padding: '4px 8px', borderRadius: '20px', fontSize: '0.65rem', fontWeight: 700 }}>
//                                                 Strict Mode
//                                             </div>
//                                         )}
//                                     </div>
//                                     <h2 style={{ margin: '0 0 1rem 0', fontSize: '1.25rem', fontWeight: 700, fontFamily: 'var(--font-heading)' }}>
//                                         {t.title}
//                                     </h2>

//                                     <div style={{ marginBottom: '10px' }}>
//                                         <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', alignItems: 'flex-end' }}>
//                                             <div style={{ fontSize: '2.2rem', fontWeight: 800, lineHeight: 1, fontFamily: 'var(--font-heading)', color: dynamicColor }}>
//                                                 {t.kpiTotalProgress.toLocaleString()} <span style={{ fontSize: '1.1rem', color: '#94a3b8', fontWeight: 600 }}>/ {t.targetGoal.toLocaleString()}</span>
//                                             </div>
//                                             <div style={{ fontSize: '1rem', fontWeight: 700, color: 'white' }}>{t.progressPercent}%</div>
//                                         </div>

//                                         <div style={{ height: '10px', background: 'rgba(255,255,255,0.1)', borderRadius: '5px', overflow: 'hidden' }}>
//                                             <div style={{
//                                                 width: `${t.progressPercent}%`,
//                                                 height: '100%',
//                                                 background: dynamicColor, // 🚀 Dynamic Bar Color
//                                                 borderRadius: '5px',
//                                                 transition: 'width 1s ease-in-out, background-color 0.5s ease'
//                                             }} />
//                                         </div>
//                                     </div>
//                                 </div>

//                                 <button
//                                     onClick={() => openKpiModal(t)}
//                                     style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: 'white', padding: '6px 12px', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem', zIndex: 10 }}
//                                 >
//                                     <Edit3 size={14} /> Adjust
//                                 </button>
//                             </div>
//                         </div>
//                     );
//                 })}

//                 <button
//                     onClick={() => openKpiModal()}
//                     style={{
//                         minWidth: '180px', flex: '0 0 auto', background: '#f8fafc',
//                         border: '2px dashed #cbd5e1', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--mlab-grey)',
//                         cursor: 'pointer', gap: '8px', borderRadius: 0, transition: 'all 0.2s', padding: '2rem'
//                     }}
//                 >
//                     <PlusCircle size={28} />
//                     <span style={{ fontWeight: 600, fontSize: '0.9rem', textAlign: 'center' }}>Add Impact Target</span>
//                 </button>
//             </div>

//             {/* ─── 4-COLUMN STAT CARDS (GLOBAL TOTALS) ─── */}
//             <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
//                 <div style={{ background: 'white', padding: '1.25rem', border: '1px solid var(--mlab-border)', borderLeft: '4px solid #8b5cf6', display: 'flex', alignItems: 'center', gap: '1rem', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.02)' }}>
//                     <div style={{ background: '#ede9fe', padding: '12px', borderRadius: '50%' }}><TrendingUp size={24} color="#8b5cf6" /></div>
//                     <div>
//                         <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--mlab-grey)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>All-Time App Impact</p>
//                         <h3 style={{ margin: '4px 0 0', color: '#8b5cf6', fontSize: '1.5rem', fontFamily: 'var(--font-heading)' }}>{allTimeImpact.toLocaleString()} <span style={{ fontSize: '0.85rem', color: 'var(--mlab-grey)' }}>Engagements</span></h3>
//                     </div>
//                 </div>

//                 <div style={{ background: 'white', padding: '1.25rem', border: '1px solid var(--mlab-border)', borderLeft: '4px solid var(--mlab-blue)', display: 'flex', alignItems: 'center', gap: '1rem', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.02)' }}>
//                     <div style={{ background: 'var(--mlab-light-blue)', padding: '12px', borderRadius: '50%' }}><Globe size={24} color="var(--mlab-blue)" /></div>
//                     <div>
//                         <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--mlab-grey)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Events</p>
//                         <h3 style={{ margin: '4px 0 0', color: 'var(--mlab-blue)', fontSize: '1.5rem', fontFamily: 'var(--font-heading)' }}>{events.length} <span style={{ fontSize: '0.85rem', color: 'var(--mlab-grey)' }}>Hosted</span></h3>
//                     </div>
//                 </div>

//                 <div style={{ background: 'white', padding: '1.25rem', border: '1px solid var(--mlab-border)', borderLeft: '4px solid var(--mlab-green)', display: 'flex', alignItems: 'center', gap: '1rem', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.02)' }}>
//                     <div style={{ background: 'var(--mlab-green-bg)', padding: '12px', borderRadius: '50%' }}><Users size={24} color="var(--mlab-green-dark)" /></div>
//                     <div>
//                         <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--mlab-grey)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Unique Guests</p>
//                         <h3 style={{ margin: '4px 0 0', color: 'var(--mlab-green-dark)', fontSize: '1.5rem', fontFamily: 'var(--font-heading)' }}>{guests.length} <span style={{ fontSize: '0.85rem', color: 'var(--mlab-grey)' }}>Profiles</span></h3>
//                     </div>
//                 </div>

//                 <div style={{ background: 'white', padding: '1.25rem', border: '1px solid var(--mlab-border)', borderLeft: '4px solid #f59e0b', display: 'flex', alignItems: 'center', gap: '1rem', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.02)' }}>
//                     <div style={{ background: '#fef3c7', padding: '12px', borderRadius: '50%' }}><Activity size={24} color="#d97706" /></div>
//                     <div>
//                         <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--mlab-grey)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Average Capacity</p>
//                         <h3 style={{ margin: '4px 0 0', color: '#d97706', fontSize: '1.5rem', fontFamily: 'var(--font-heading)' }}>{averageCapacity}% <span style={{ fontSize: '0.85rem', color: 'var(--mlab-grey)' }}>Fill Rate</span></h3>
//                     </div>
//                 </div>
//             </div>

//             {/* ─── SEARCH & TOOLBAR ─── */}
//             <div className="mlab-toolbar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.5rem' }}>
//                 <div className="mlab-search" style={{ minWidth: '250px', background: '#f8fafc', height: 35, borderRadius: 0, border: '1px solid var(--mlab-border)', padding: '4px 12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
//                     <Search size={18} color="var(--mlab-grey)" />
//                     <input
//                         type="text"
//                         placeholder={activeTab === 'events' ? "Search events or locations..." : "Search guests by name or email..."}
//                         value={searchTerm}
//                         onChange={(e) => setSearchTerm(e.target.value)}
//                         style={{ border: 'none', outline: 'none', background: 'transparent', width: '100%' }}
//                     />
//                 </div>

//                 {activeTab === 'events' && (
//                     <button
//                         className="mlab-btn mlab-btn--primary"
//                         onClick={() => {
//                             setSelectedEvent(null);
//                             setShowEventModal(true);
//                         }}
//                     >
//                         <PlusCircle size={16} /> Create New Event
//                     </button>
//                 )}
//             </div>

//             {/* ─── EVENTS TAB CONTENT ─── */}
//             {activeTab === 'events' && (
//                 <div className="mlab-table-wrap">
//                     <table className="mlab-table">
//                         <thead>
//                             <tr>
//                                 <th>Event Name & Date</th>
//                                 <th>Location</th>
//                                 <th>Capacity</th>
//                                 <th>Custom Fields</th>
//                                 <th className="att-th--right">Action</th>
//                             </tr>
//                         </thead>
//                         <tbody>
//                             {filteredEvents.length > 0 ? filteredEvents.map(event => {
//                                 const diffDays = getEventDaysCount(event.date, (event as any).endDate);
//                                 const totalCheckins = event.currentCheckIns || 0;
//                                 const displayCheckins = diffDays > 1 ? Math.round(totalCheckins / diffDays) : totalCheckins;
//                                 const capacityLabel = diffDays > 1 ? 'Avg/Day' : 'Checked In';

//                                 const capacityPercent = event.maxCapacity ? Math.round((displayCheckins / event.maxCapacity) * 100) : 0;
//                                 let badgeBg = '#ecfccb';
//                                 let badgeColor = '#65a30d';
//                                 let badgeBorder = '#d9f99d';

//                                 if (capacityPercent >= 100) {
//                                     badgeBg = '#fee2e2';
//                                     badgeColor = '#dc2626';
//                                     badgeBorder = '#fecaca';
//                                 } else if (capacityPercent >= 80) {
//                                     badgeBg = '#fef3c7';
//                                     badgeColor = '#d97706';
//                                     badgeBorder = '#fde68a';
//                                 }

//                                 return (
//                                     <tr key={event.id}>
//                                         <td>
//                                             <div style={{ fontWeight: 600, color: 'var(--mlab-blue)' }}>{event.eventName}</div>
//                                             {event.eventType && (
//                                                 <div style={{ fontSize: '0.7rem', color: 'var(--mlab-green)', fontWeight: 'bold', textTransform: 'uppercase', marginTop: '2px' }}>
//                                                     {event.eventType}
//                                                 </div>
//                                             )}
//                                             <div style={{ fontSize: '0.75rem', color: 'var(--mlab-grey)', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '4px' }}>
//                                                 <Calendar size={12} color="#94a3b8" />
//                                                 {formatEventDuration(event.date, (event as any).endDate)}
//                                             </div>
//                                         </td>
//                                         <td>
//                                             <div style={{ fontSize: '0.85rem' }}>{event.location.split(',')[0]}</div>
//                                         </td>
//                                         <td>
//                                             <span className="att-badge" style={{ background: badgeBg, color: badgeColor, border: `1px solid ${badgeBorder}` }}>
//                                                 {displayCheckins} / {event.maxCapacity} {capacityLabel}
//                                             </span>
//                                             {diffDays > 1 && (
//                                                 <div style={{ fontSize: '0.65rem', color: 'var(--mlab-grey)', marginTop: '4px', textAlign: 'center', fontWeight: 500 }}>
//                                                     {totalCheckins} Total Scans
//                                                 </div>
//                                             )}
//                                         </td>
//                                         <td>
//                                             <span style={{ fontSize: '0.75rem', color: 'var(--mlab-grey)' }}>
//                                                 {event.guestFormBlueprint?.length || 0} Extra Question(s)
//                                             </span>
//                                         </td>
//                                         <td className="att-td--right">
//                                             <button
//                                                 className="cdp-btn cdp-btn--sky"
//                                                 onClick={() => {
//                                                     setSelectedEvent(event);
//                                                     setShowEventModal(true);
//                                                 }}
//                                                 title="Edit Event"
//                                             >
//                                                 <Settings size={14} />
//                                             </button>

//                                             <button
//                                                 className="cdp-btn cdp-btn--outline"
//                                                 style={{ marginLeft: 8 }}
//                                                 onClick={() => handleDuplicateEvent(event)}
//                                                 title="Duplicate Event"
//                                             >
//                                                 <Copy size={14} />
//                                             </button>

//                                             <button
//                                                 className="cdp-btn cdp-btn--outline"
//                                                 style={{ marginLeft: 8, paddingLeft: 12, paddingRight: 12 }}
//                                                 onClick={() => navigate(`/admin/ecosystem/event/${event.id}`)}
//                                             >
//                                                 <Users size={14} /> Roster
//                                             </button>

//                                             <button
//                                                 className="mlab-btn mlab-btn--sm"
//                                                 style={{ marginLeft: '8px', background: 'var(--mlab-blue)', color: 'white' }}
//                                                 onClick={() => window.open(`/event-kiosk/${event.id}`, '_blank')}
//                                                 title="Open TV Kiosk"
//                                             >
//                                                 <QrCode size={14} />
//                                             </button>
//                                         </td>
//                                     </tr>
//                                 );
//                             }) : (
//                                 <tr>
//                                     <td colSpan={5} style={{ padding: '3rem', textAlign: 'center', color: 'var(--mlab-grey)' }}>
//                                         No events found. Click "Create New Event" to get started.
//                                     </td>
//                                 </tr>
//                             )}
//                         </tbody>
//                     </table>
//                 </div>
//             )}

//             {/* ─── GUESTS TAB CONTENT ─── */}
//             {activeTab === 'guests' && (
//                 <div className="mlab-table-wrap">
//                     <table className="mlab-table">
//                         <thead>
//                             <tr>
//                                 <th>Guest Name</th>
//                                 <th>Email Address</th>
//                                 <th>Mobile</th>
//                                 <th>Status</th>
//                             </tr>
//                         </thead>
//                         <tbody>
//                             {filteredGuests.length > 0 ? filteredGuests.map(guest => (
//                                 <tr key={guest.email}>
//                                     <td><div style={{ fontWeight: 600 }}>{guest.firstName} {guest.lastName}</div></td>
//                                     <td>{guest.email}</td>
//                                     <td>{guest.phone}</td>
//                                     <td>
//                                         <span className="att-badge att-badge--present">
//                                             <CheckCircle size={11} /> Verified CRM Profile
//                                         </span>
//                                     </td>
//                                 </tr>
//                             )) : (
//                                 <tr>
//                                     <td colSpan={4} style={{ padding: '3rem', textAlign: 'center', color: 'var(--mlab-grey)' }}>
//                                         No guests found. Data will populate once visitors start checking in.
//                                     </td>
//                                 </tr>
//                             )}
//                         </tbody>
//                     </table>
//                 </div>
//             )}
//         </div>
//     );
// };




// // // src/components/AdminPortal/EcosystemDashboard/EcosystemDashboard.tsx

// // import React, { useState, useEffect, useMemo } from 'react';
// // import { createPortal } from 'react-dom';
// // import { doc, collection, setDoc, updateDoc, onSnapshot, query, orderBy } from 'firebase/firestore';
// // import {
// //     Calendar, Users, Search, PlusCircle, QrCode,
// //     Settings, CheckCircle, Globe, Database, Copy, TrendingUp, Activity, Target, X, Save, Edit3, Trash2, Archive, Link2
// // } from 'lucide-react';
// // import { db } from '../../../lib/firebase';
// // import Loader from '../../../components/common/Loader/Loader';
// // import { useToast } from '../../../components/common/Toast/Toast';
// // import { useStore } from '../../../store/useStore';

// // import { EventBuilderModal } from './EventBuilderModal';

// // import '../../../components/views/LearnersView/LearnersView.css';
// // import "../../../pages/FacilitatorDashboard/AttendanceRegister/AttendanceHistoryList.css";
// // import type { EcosystemEvent } from '../../../types/ecosystem.types';
// // import { useNavigate } from 'react-router-dom';
// // import moment from 'moment';
// // import { StatusModal } from '../../common/StatusModal/StatusModal';

// // // ─── SMART DATE & CAPACITY HELPERS ───

// // const getEventDaysCount = (startIso: string, endIso?: string) => {
// //     if (!startIso) return 1;
// //     const start = new Date(startIso);
// //     const end = endIso ? new Date(endIso) : start;

// //     start.setHours(0, 0, 0, 0);
// //     end.setHours(0, 0, 0, 0);

// //     return Math.max(1, Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1);
// // };

// // const formatEventDuration = (startIso: string, endIso?: string) => {
// //     if (!startIso) return "Date TBD";
// //     const start = new Date(startIso);
// //     const end = endIso ? new Date(endIso) : start;

// //     const diffDays = getEventDaysCount(startIso, endIso);
// //     const startStr = start.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' });

// //     if (diffDays <= 1) return startStr;

// //     if (start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear()) {
// //         const monthYear = start.toLocaleDateString('en-ZA', { month: 'short', year: 'numeric' });
// //         return `${start.getDate()} – ${end.getDate()} ${monthYear} (${diffDays} Days)`;
// //     }

// //     const endStr = end.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' });
// //     return `${startStr} – ${endStr} (${diffDays} Days)`;
// // };

// // const DEFAULT_KPI = {
// //     title: "FY26/27 Ecosystem Impact Goal",
// //     startDate: moment().startOf('year').format('YYYY-MM-DD'),
// //     endDate: moment().endOf('year').format('YYYY-MM-DD'),
// //     targetAmount: 1000,
// //     offlineCarryover: 0,
// //     isArchived: false,
// //     linkedEvents: []
// // };

// // export const EcosystemDashboard: React.FC = () => {
// //     const toast = useToast();
// //     const { programmes, user } = useStore();
// //     const navigate = useNavigate();

// //     const isSuperAdmin = (user as any)?.isSuperAdmin === true;

// //     // ─── TABS & LOADING STATE ───
// //     const [activeTab, setActiveTab] = useState<'events' | 'guests'>('events');
// //     const [isLoading, setIsLoading] = useState(true);

// //     // ─── MODAL STATES ───
// //     const [showEventModal, setShowEventModal] = useState(false);
// //     const [selectedEvent, setSelectedEvent] = useState<EcosystemEvent | null>(null);
// //     const [showKpiModal, setShowKpiModal] = useState(false);

// //     // 🚀 DUAL-ACTION STATES
// //     const [targetToArchive, setTargetToArchive] = useState<string | null>(null);
// //     const [targetToDelete, setTargetToDelete] = useState<string | null>(null);

// //     // ─── DATA STATES ───
// //     const [events, setEvents] = useState<EcosystemEvent[]>([]);
// //     const [guests, setGuests] = useState<any[]>([]);
// //     const [searchTerm, setSearchTerm] = useState('');
// //     const [targets, setTargets] = useState<any[]>([]);
// //     const [kpiForm, setKpiForm] = useState<any>(null);

// //     // 🚀 NEW: Search state for the Explicit Linkage list inside the Modal
// //     const [kpiEventSearch, setKpiEventSearch] = useState('');

// //     useEffect(() => {
// //         setIsLoading(true);

// //         const eventsQuery = query(collection(db, 'events'), orderBy('date', 'desc'));
// //         const unsubscribeEvents = onSnapshot(eventsQuery, (snapshot) => {
// //             const fetchedEvents = snapshot.docs.map(doc => ({
// //                 id: doc.id,
// //                 ...doc.data()
// //             })) as EcosystemEvent[];
// //             setEvents(fetchedEvents);
// //             setIsLoading(false);
// //         }, (error) => {
// //             console.error("Error fetching events:", error);
// //             toast.error("Failed to load ecosystem events.");
// //             setIsLoading(false);
// //         });

// //         const guestsQuery = query(collection(db, 'ecosystem_guests'), orderBy('lastSeenAt', 'desc'));
// //         const unsubscribeGuests = onSnapshot(guestsQuery, (snapshot) => {
// //             const fetchedGuests = snapshot.docs.map(doc => ({
// //                 email: doc.id,
// //                 ...doc.data()
// //             }));
// //             setGuests(fetchedGuests);
// //         });

// //         const unsubscribeKpi = onSnapshot(doc(db, 'system_settings', 'ecosystem_kpi'), (docSnap) => {
// //             if (docSnap.exists()) {
// //                 const data = docSnap.data();
// //                 setTargets(data.targets || []);
// //             } else {
// //                 setTargets([]);
// //             }
// //         });

// //         return () => {
// //             unsubscribeEvents();
// //             unsubscribeGuests();
// //             unsubscribeKpi();
// //         };
// //         // eslint-disable-next-line react-hooks/exhaustive-deps
// //     }, []);

// //     // ─── EVENT HANDLERS ───
// //     const handleSaveEvent = async (eventData: Partial<EcosystemEvent>) => {
// //         try {
// //             const isEdit = !!selectedEvent?.id;
// //             const eventRef = isEdit
// //                 ? doc(db, 'events', selectedEvent.id)
// //                 : doc(collection(db, 'events'));

// //             const payload: any = {
// //                 ...eventData,
// //                 updatedAt: new Date().toISOString(),
// //             };

// //             if (isEdit) {
// //                 await updateDoc(eventRef, payload);
// //                 toast.success("Event updated successfully!");
// //             } else {
// //                 payload.id = eventRef.id;
// //                 payload.createdBy = user?.uid || 'admin';
// //                 payload.currentCheckIns = 0;
// //                 payload.status = 'active';
// //                 payload.createdAt = new Date().toISOString();

// //                 await setDoc(eventRef, payload);
// //                 toast.success("Event created successfully!");
// //             }

// //             setShowEventModal(false);
// //             setSelectedEvent(null);

// //         } catch (error: any) {
// //             console.error("Failed to save event:", error);
// //             throw error;
// //         }
// //     };

// //     const handleDuplicateEvent = (eventToCopy: EcosystemEvent) => {
// //         const { id, currentCheckIns, createdAt, updatedAt, status, createdBy, ...clonedData } = eventToCopy as any;
// //         const newEventDraft = {
// //             ...clonedData,
// //             eventName: `${clonedData.eventName} (Copy)`
// //         } as EcosystemEvent;
// //         setSelectedEvent(newEventDraft);
// //         setShowEventModal(true);
// //     };

// //     // ─── KPI TARGET HANDLERS ───
// //     const openKpiModal = (targetData?: any) => {
// //         setKpiEventSearch(''); // 🚀 Reset search field whenever modal opens

// //         if (targetData) {
// //             setKpiForm({ ...targetData, linkedEvents: targetData.linkedEvents || [] });
// //         } else {
// //             setKpiForm({
// //                 id: `target_${Date.now()}`,
// //                 title: "New Impact Target",
// //                 startDate: moment().startOf('year').format('YYYY-MM-DD'),
// //                 endDate: moment().endOf('year').format('YYYY-MM-DD'),
// //                 targetAmount: 1000,
// //                 offlineCarryover: 0,
// //                 isArchived: false,
// //                 linkedEvents: []
// //             });
// //         }
// //         setShowKpiModal(true);
// //     };

// //     const handleSaveKpi = async () => {
// //         try {
// //             const existingIndex = targets.findIndex(t => t.id === kpiForm.id);
// //             let updatedTargets = [...targets];

// //             if (existingIndex >= 0) {
// //                 updatedTargets[existingIndex] = kpiForm;
// //             } else {
// //                 updatedTargets.push(kpiForm);
// //             }

// //             await setDoc(doc(db, 'system_settings', 'ecosystem_kpi'), { targets: updatedTargets }, { merge: true });
// //             toast.success("Impact Target saved successfully.");
// //             setShowKpiModal(false);
// //         } catch (error) {
// //             console.error("Failed to save target config:", error);
// //             toast.error("Failed to update target.");
// //         }
// //     };

// //     const executeArchiveKpi = async () => {
// //         if (!targetToArchive) return;
// //         try {
// //             const updatedTargets = targets.map(t => t.id === targetToArchive ? { ...t, isArchived: true } : t);
// //             await setDoc(doc(db, 'system_settings', 'ecosystem_kpi'), { targets: updatedTargets }, { merge: true });
// //             toast.success("Impact Target successfully archived.");
// //         } catch (error) {
// //             console.error("Failed to archive target:", error);
// //             toast.error("Failed to archive target.");
// //         } finally {
// //             setTargetToArchive(null);
// //         }
// //     };

// //     const executeDeleteKpi = async () => {
// //         if (!targetToDelete) return;
// //         try {
// //             const updatedTargets = targets.filter(t => t.id !== targetToDelete);
// //             await setDoc(doc(db, 'system_settings', 'ecosystem_kpi'), { targets: updatedTargets }, { merge: true });
// //             toast.success("Impact Target permanently deleted.");
// //         } catch (error) {
// //             console.error("Failed to delete target:", error);
// //             toast.error("Failed to delete target.");
// //         } finally {
// //             setTargetToDelete(null);
// //         }
// //     };

// //     // ─── SMART BI-DIRECTIONAL METRICS CALCULATION ───
// //     const calculatedTargets = useMemo(() => {
// //         return targets
// //             .filter(t => !t.isArchived)
// //             .map(target => {
// //                 const kpiStart = moment(target.startDate).startOf('day');
// //                 const kpiEnd = moment(target.endDate).endOf('day');
// //                 const targetHasExplicitEvents = target.linkedEvents && target.linkedEvents.length > 0;
// //                 let kpiWindowImpact = 0;

// //                 events.forEach(e => {
// //                     const checkins = e.currentCheckIns || 0;

// //                     let countsTowardsTarget = false;

// //                     if (targetHasExplicitEvents) {
// //                         if (target.linkedEvents.includes(e.id)) countsTowardsTarget = true;
// //                         if (e.linkedTargets?.includes(target.id)) countsTowardsTarget = true;
// //                     } else {
// //                         if (e.linkedTargets?.includes(target.id)) {
// //                             countsTowardsTarget = true;
// //                         } else if ((!e.linkedTargets || e.linkedTargets.length === 0)) {
// //                             if (e.date && moment(e.date).isBetween(kpiStart, kpiEnd, 'day', '[]')) {
// //                                 countsTowardsTarget = true;
// //                             }
// //                         }
// //                     }

// //                     if (countsTowardsTarget) {
// //                         kpiWindowImpact += checkins;
// //                     }
// //                 });

// //                 const kpiTotalProgress = kpiWindowImpact + (Number(target.offlineCarryover) || 0);
// //                 const targetGoal = Number(target.targetAmount) || 1;
// //                 const progressPercent = Math.min(100, Math.round((kpiTotalProgress / targetGoal) * 100));

// //                 return { ...target, kpiTotalProgress, targetGoal, progressPercent };
// //             }).sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
// //     }, [events, targets]);

// //     const { allTimeImpact, averageCapacity } = useMemo(() => {
// //         let impact = 0;
// //         let validCapacityEvents = 0;
// //         let totalCapacityPercentage = 0;

// //         events.forEach(e => {
// //             impact += (e.currentCheckIns || 0);
// //             if (e.maxCapacity && e.maxCapacity > 0) {
// //                 const diffDays = getEventDaysCount(e.date, (e as any).endDate);
// //                 const dailyCheckins = diffDays > 1 ? Math.round((e.currentCheckIns || 0) / diffDays) : (e.currentCheckIns || 0);
// //                 totalCapacityPercentage += (dailyCheckins / e.maxCapacity);
// //                 validCapacityEvents++;
// //             }
// //         });

// //         return {
// //             allTimeImpact: impact,
// //             averageCapacity: validCapacityEvents > 0 ? Math.round((totalCapacityPercentage / validCapacityEvents) * 100) : 0
// //         };
// //     }, [events]);

// //     const filteredEvents = events.filter(e =>
// //         e.eventName.toLowerCase().includes(searchTerm.toLowerCase()) ||
// //         e.location.toLowerCase().includes(searchTerm.toLowerCase()) ||
// //         (e.eventType && e.eventType.toLowerCase().includes(searchTerm.toLowerCase()))
// //     );

// //     const filteredGuests = guests.filter(g =>
// //         (g.firstName + ' ' + g.lastName).toLowerCase().includes(searchTerm.toLowerCase()) ||
// //         g.email.toLowerCase().includes(searchTerm.toLowerCase())
// //     );

// //     // 🚀 Filter events specifically for the KPI Modal search bar
// //     const filteredKpiModalEvents = events.filter(e =>
// //         e.eventName.toLowerCase().includes(kpiEventSearch.toLowerCase())
// //     );

// //     if (isLoading) {
// //         return (
// //             <div className="att-loader-wrap">
// //                 <Loader message="Loading Ecosystem Data…" />
// //             </div>
// //         );
// //     }

// //     return (
// //         <div className="att-root animate-fade-in">

// //             {showEventModal && createPortal(
// //                 <EventBuilderModal
// //                     event={selectedEvent}
// //                     programmes={programmes}
// //                     availableTargets={targets.filter(t => !t.isArchived)}
// //                     onClose={() => {
// //                         setShowEventModal(false);
// //                         setSelectedEvent(null);
// //                     }}
// //                     onSave={handleSaveEvent}
// //                 />,
// //                 document.body
// //             )}

// //             {targetToArchive && createPortal(
// //                 <StatusModal
// //                     type="warning"
// //                     title="Archive Impact Target?"
// //                     message="Are you sure you want to archive this Ecosystem Target? It will be hidden from the dashboard, but all check-in data and historical links remain perfectly intact in the database."
// //                     confirmText="Yes, Archive It"
// //                     onClose={executeArchiveKpi}
// //                     onCancel={() => setTargetToArchive(null)}
// //                 />,
// //                 document.body
// //             )}

// //             {targetToDelete && createPortal(
// //                 <StatusModal
// //                     type="error"
// //                     title="Permanently Delete Target?"
// //                     message="DANGER: Are you absolutely sure you want to permanently delete this Ecosystem Target? This action cannot be undone and the card will be wiped from the system."
// //                     confirmText="Yes, Permanently Delete"
// //                     onClose={executeDeleteKpi}
// //                     onCancel={() => setTargetToDelete(null)}
// //                 />,
// //                 document.body
// //             )}

// //             {/* ─── TARGET SETTINGS MODAL ─── */}
// //             {showKpiModal && kpiForm && createPortal(
// //                 <div className="lfm-overlay" onClick={() => setShowKpiModal(false)} style={{ zIndex: 999 }}>
// //                     <div className="lfm-modal animate-fade-in" onClick={e => e.stopPropagation()} style={{ maxWidth: '500px' }}>
// //                         <div className="lfm-header">
// //                             <h2 className="lfm-header__title"><Target size={16} /> Configure Impact Target</h2>
// //                             <button className="lfm-close-btn" onClick={() => setShowKpiModal(false)}><X size={20} /></button>
// //                         </div>
// //                         <div className="lfm-body" style={{ padding: '1.5rem', background: '#f8fafc' }}>
// //                             <div className="mlab-form-group mb-4">
// //                                 <label>Target Name / Title</label>
// //                                 <input type="text" className="mlab-input bg-white" value={kpiForm.title} onChange={e => setKpiForm({ ...kpiForm, title: e.target.value })} placeholder="e.g. FY26 Ecosystem Impact" />
// //                             </div>
// //                             <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
// //                                 <div className="mlab-form-group" style={{ flex: 1 }}>
// //                                     <label>Start Date</label>
// //                                     <input type="date" className="mlab-input bg-white" value={kpiForm.startDate} onChange={e => setKpiForm({ ...kpiForm, startDate: e.target.value })} />
// //                                 </div>
// //                                 <div className="mlab-form-group" style={{ flex: 1 }}>
// //                                     <label>End Date</label>
// //                                     <input type="date" className="mlab-input bg-white" value={kpiForm.endDate} onChange={e => setKpiForm({ ...kpiForm, endDate: e.target.value })} />
// //                                 </div>
// //                             </div>
// //                             <div style={{ display: 'flex', gap: '1rem' }}>
// //                                 <div className="mlab-form-group" style={{ flex: 1 }}>
// //                                     <label>Target Goal Amount</label>
// //                                     <input type="number" className="mlab-input bg-white" value={kpiForm.targetAmount} onChange={e => setKpiForm({ ...kpiForm, targetAmount: Number(e.target.value) })} />
// //                                 </div>
// //                                 <div className="mlab-form-group" style={{ flex: 1 }}>
// //                                     <label>Offline Base Impact</label>
// //                                     <input type="number" className="mlab-input bg-white" value={kpiForm.offlineCarryover} onChange={e => setKpiForm({ ...kpiForm, offlineCarryover: Number(e.target.value) })} />
// //                                 </div>
// //                             </div>

// //                             <div style={{ background: 'white', border: '1px solid #cbd5e1', padding: '1rem', marginTop: '1.5rem' }}>
// //                                 <h4 style={{ display: 'flex', alignItems: 'center', gap: '6px', margin: '0 0 4px 0', fontSize: '0.85rem', color: 'var(--mlab-midnight)' }}>
// //                                     <Link2 size={14} /> Explicitly Link Events
// //                                 </h4>
// //                                 <p style={{ fontSize: '0.75rem', color: 'var(--mlab-grey)', margin: '0 0 10px 0', lineHeight: 1.4 }}>
// //                                     If you select events here, this target will <strong>only</strong> track these specific events. Leave blank to auto-absorb any event within the date range above.
// //                                 </p>

// //                                 <div className="mlab-search" style={{ marginBottom: '12px', background: '#f8fafc', border: '1px solid #e2e8f0', padding: '4px 10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
// //                                     <Search size={14} color="#94a3b8" />
// //                                     <input
// //                                         type="text"
// //                                         placeholder="Search events to link..."
// //                                         value={kpiEventSearch}
// //                                         onChange={(e) => setKpiEventSearch(e.target.value)}
// //                                         style={{ border: 'none', outline: 'none', background: 'transparent', width: '100%', fontSize: '0.75rem' }}
// //                                     />
// //                                 </div>

// //                                 <div style={{ maxHeight: '160px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px', paddingRight: '4px' }}>
// //                                     {events.length === 0 && <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>No events available yet.</span>}
// //                                     {events.length > 0 && filteredKpiModalEvents.length === 0 && (
// //                                         <span style={{ fontSize: '0.75rem', color: '#94a3b8', fontStyle: 'italic', textAlign: 'center', padding: '1rem 0' }}>
// //                                             No events match "{kpiEventSearch}"
// //                                         </span>
// //                                     )}
// //                                     {filteredKpiModalEvents.map(e => {
// //                                         const isChecked = kpiForm.linkedEvents?.includes(e.id);
// //                                         return (
// //                                             <label key={e.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem', background: isChecked ? '#f0f9ff' : '#f8fafc', padding: '8px 10px', border: `1px solid ${isChecked ? '#7dd3fc' : '#e2e8f0'}`, cursor: 'pointer', transition: 'all 0.1s' }}>
// //                                                 <input
// //                                                     type="checkbox"
// //                                                     checked={isChecked}
// //                                                     onChange={(ev) => {
// //                                                         const newLinks = ev.target.checked
// //                                                             ? [...(kpiForm.linkedEvents || []), e.id]
// //                                                             : (kpiForm.linkedEvents || []).filter((id: string) => id !== e.id);
// //                                                         setKpiForm({ ...kpiForm, linkedEvents: newLinks });
// //                                                     }}
// //                                                     style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: 'var(--mlab-blue)' }}
// //                                                 />
// //                                                 <div style={{ flex: 1 }}>
// //                                                     <div style={{ fontWeight: 600, color: 'var(--mlab-blue)' }}>{e.eventName}</div>
// //                                                     <div style={{ color: '#94a3b8', fontSize: '0.7rem' }}>{moment(e.date).format('DD MMM YYYY')}</div>
// //                                                 </div>
// //                                             </label>
// //                                         );
// //                                     })}
// //                                 </div>
// //                             </div>

// //                         </div>

// //                         <div className="lfm-footer" style={{ display: 'flex', justifyContent: targets.some(t => t.id === kpiForm.id) && isSuperAdmin ? 'space-between' : 'flex-end' }}>
// //                             {targets.some(t => t.id === kpiForm.id) && isSuperAdmin && (
// //                                 <div style={{ display: 'flex', gap: '8px' }}>
// //                                     <button
// //                                         type="button"
// //                                         style={{ color: '#ef4444', background: 'rgba(239, 68, 68, 0.1)', border: 'none', padding: '8px 12px', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
// //                                         onClick={() => {
// //                                             setShowKpiModal(false);
// //                                             setTargetToDelete(kpiForm.id);
// //                                         }}
// //                                         title="Permanently Delete"
// //                                     >
// //                                         <Trash2 size={16} />
// //                                     </button>
// //                                     <button
// //                                         type="button"
// //                                         style={{ color: '#f59e0b', background: 'rgba(245, 158, 11, 0.1)', border: 'none', padding: '8px 12px', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', fontWeight: 600 }}
// //                                         onClick={() => {
// //                                             setShowKpiModal(false);
// //                                             setTargetToArchive(kpiForm.id);
// //                                         }}
// //                                         title="Archive (Hide from Dashboard)"
// //                                     >
// //                                         <Archive size={14} style={{ marginRight: '6px' }} /> Archive
// //                                     </button>
// //                                 </div>
// //                             )}
// //                             <div style={{ display: 'flex', gap: '8px' }}>
// //                                 <button className="lfm-btn lfm-btn--ghost" onClick={() => setShowKpiModal(false)}>Cancel</button>
// //                                 <button className="lfm-btn lfm-btn--primary" onClick={handleSaveKpi}><Save size={14} /> Save Target</button>
// //                             </div>
// //                         </div>
// //                     </div>
// //                 </div>,
// //                 document.body
// //             )}

// //             {/* ─── HEADER TABS ─── */}
// //             <div className="att-tabs" role="tablist">
// //                 <button
// //                     role="tab"
// //                     className={`att-tab${activeTab === 'events' ? ' att-tab--active' : ''}`}
// //                     onClick={() => { setActiveTab('events'); setSearchTerm(''); }}
// //                 >
// //                     <Calendar size={14} /> Ecosystem Events
// //                 </button>
// //                 <button
// //                     role="tab"
// //                     className={`att-tab${activeTab === 'guests' ? ' att-tab--active' : ''}`}
// //                     onClick={() => { setActiveTab('guests'); setSearchTerm(''); }}
// //                 >
// //                     <Database size={14} /> Guest CRM Ledger
// //                 </button>
// //             </div>

// //             {/* HORIZONTAL KPI TARGET SCROLL */}
// //             <div style={{ display: 'flex', gap: '1rem', overflowX: 'auto', paddingBottom: '1rem', marginBottom: '0.5rem', scrollbarWidth: 'none' }}>
// //                 {calculatedTargets.map(t => (
// //                     <div key={t.id} style={{ minWidth: '350px', flex: '0 0 auto', background: '#0f172a', padding: '1.5rem', color: 'white', position: 'relative', overflow: 'hidden', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)' }}>
// //                         <div style={{ position: 'absolute', right: '-10%', top: '-20%', opacity: 0.05 }}><Target size={180} color="white" /></div>

// //                         <div style={{ position: 'relative', zIndex: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
// //                             <div style={{ flex: 1 }}>
// //                                 <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
// //                                     <div style={{ background: 'rgba(255,255,255,0.1)', padding: '4px 10px', borderRadius: '20px', fontSize: '0.7rem', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
// //                                         {moment(t.startDate).format('D MMM YYYY')} — {moment(t.endDate).format('D MMM YYYY')}
// //                                     </div>
// //                                     {t.linkedEvents && t.linkedEvents.length > 0 && (
// //                                         <div style={{ background: 'rgba(56, 189, 248, 0.2)', color: '#38bdf8', padding: '4px 8px', borderRadius: '20px', fontSize: '0.65rem', fontWeight: 700 }}>
// //                                             Strict Mode
// //                                         </div>
// //                                     )}
// //                                 </div>
// //                                 <h2 style={{ margin: '0 0 1rem 0', fontSize: '1.25rem', fontWeight: 700, fontFamily: 'var(--font-heading)' }}>
// //                                     {t.title}
// //                                 </h2>

// //                                 <div style={{ marginBottom: '10px' }}>
// //                                     <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', alignItems: 'flex-end' }}>
// //                                         <div style={{ fontSize: '2.2rem', fontWeight: 800, lineHeight: 1, fontFamily: 'var(--font-heading)', color: '#10b981' }}>
// //                                             {t.kpiTotalProgress.toLocaleString()} <span style={{ fontSize: '1.1rem', color: '#94a3b8', fontWeight: 600 }}>/ {t.targetGoal.toLocaleString()}</span>
// //                                         </div>
// //                                         <div style={{ fontSize: '1rem', fontWeight: 700, color: 'white' }}>{t.progressPercent}%</div>
// //                                     </div>

// //                                     <div style={{ height: '10px', background: 'rgba(255,255,255,0.1)', borderRadius: '5px', overflow: 'hidden' }}>
// //                                         <div style={{
// //                                             width: `${t.progressPercent}%`,
// //                                             height: '100%',
// //                                             background: t.progressPercent >= 100 ? '#34d399' : '#10b981',
// //                                             borderRadius: '5px',
// //                                             transition: 'width 1s ease-in-out'
// //                                         }} />
// //                                     </div>
// //                                 </div>
// //                             </div>

// //                             <button
// //                                 onClick={() => openKpiModal(t)}
// //                                 style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: 'white', padding: '6px 12px', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem', zIndex: 10 }}
// //                             >
// //                                 <Edit3 size={14} /> Adjust
// //                             </button>
// //                         </div>
// //                     </div>
// //                 ))}

// //                 <button
// //                     onClick={() => openKpiModal()}
// //                     style={{
// //                         minWidth: '180px', flex: '0 0 auto', background: '#f8fafc', border: '2px dashed #cbd5e1', display: 'flex',
// //                         flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--mlab-grey)',
// //                         cursor: 'pointer', gap: '8px', transition: 'all 0.2s', padding: '2rem',
// //                         borderRadius: 0,
// //                     }}
// //                 >
// //                     <PlusCircle size={28} />
// //                     <span style={{ fontWeight: 600, fontSize: '0.9rem', textAlign: 'center' }}>Add Impact Target</span>
// //                 </button>
// //             </div>

// //             {/* ─── 4-COLUMN STAT CARDS (GLOBAL TOTALS) ─── */}
// //             <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
// //                 <div style={{ background: 'white', padding: '1.25rem', border: '1px solid var(--mlab-border)', borderLeft: '4px solid #8b5cf6', display: 'flex', alignItems: 'center', gap: '1rem', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.02)' }}>
// //                     <div style={{ background: '#ede9fe', padding: '12px', borderRadius: '50%' }}><TrendingUp size={24} color="#8b5cf6" /></div>
// //                     <div>
// //                         <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--mlab-grey)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>All-Time App Impact</p>
// //                         <h3 style={{ margin: '4px 0 0', color: '#8b5cf6', fontSize: '1.5rem', fontFamily: 'var(--font-heading)' }}>{allTimeImpact.toLocaleString()} <span style={{ fontSize: '0.85rem', color: 'var(--mlab-grey)' }}>Scans</span></h3>
// //                     </div>
// //                 </div>

// //                 <div style={{ background: 'white', padding: '1.25rem', border: '1px solid var(--mlab-border)', borderLeft: '4px solid var(--mlab-blue)', display: 'flex', alignItems: 'center', gap: '1rem', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.02)' }}>
// //                     <div style={{ background: 'var(--mlab-light-blue)', padding: '12px', borderRadius: '50%' }}><Globe size={24} color="var(--mlab-blue)" /></div>
// //                     <div>
// //                         <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--mlab-grey)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Events</p>
// //                         <h3 style={{ margin: '4px 0 0', color: 'var(--mlab-blue)', fontSize: '1.5rem', fontFamily: 'var(--font-heading)' }}>{events.length} <span style={{ fontSize: '0.85rem', color: 'var(--mlab-grey)' }}>Hosted</span></h3>
// //                     </div>
// //                 </div>

// //                 <div style={{ background: 'white', padding: '1.25rem', border: '1px solid var(--mlab-border)', borderLeft: '4px solid var(--mlab-green)', display: 'flex', alignItems: 'center', gap: '1rem', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.02)' }}>
// //                     <div style={{ background: 'var(--mlab-green-bg)', padding: '12px', borderRadius: '50%' }}><Users size={24} color="var(--mlab-green-dark)" /></div>
// //                     <div>
// //                         <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--mlab-grey)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Unique Guests</p>
// //                         <h3 style={{ margin: '4px 0 0', color: 'var(--mlab-green-dark)', fontSize: '1.5rem', fontFamily: 'var(--font-heading)' }}>{guests.length} <span style={{ fontSize: '0.85rem', color: 'var(--mlab-grey)' }}>Profiles</span></h3>
// //                     </div>
// //                 </div>

// //                 <div style={{ background: 'white', padding: '1.25rem', border: '1px solid var(--mlab-border)', borderLeft: '4px solid #f59e0b', display: 'flex', alignItems: 'center', gap: '1rem', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.02)' }}>
// //                     <div style={{ background: '#fef3c7', padding: '12px', borderRadius: '50%' }}><Activity size={24} color="#d97706" /></div>
// //                     <div>
// //                         <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--mlab-grey)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Average Capacity</p>
// //                         <h3 style={{ margin: '4px 0 0', color: '#d97706', fontSize: '1.5rem', fontFamily: 'var(--font-heading)' }}>{averageCapacity}% <span style={{ fontSize: '0.85rem', color: 'var(--mlab-grey)' }}>Fill Rate</span></h3>
// //                     </div>
// //                 </div>
// //             </div>

// //             {/* ─── SEARCH & TOOLBAR ─── */}
// //             <div className="mlab-toolbar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.5rem' }}>
// //                 <div className="mlab-search" style={{ minWidth: '250px', background: '#f8fafc', height: 35, borderRadius: 0, border: '1px solid var(--mlab-border)', padding: '4px 12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
// //                     <Search size={18} color="var(--mlab-grey)" />
// //                     <input
// //                         type="text"
// //                         placeholder={activeTab === 'events' ? "Search events or locations..." : "Search guests by name or email..."}
// //                         value={searchTerm}
// //                         onChange={(e) => setSearchTerm(e.target.value)}
// //                         style={{ border: 'none', outline: 'none', background: 'transparent', width: '100%' }}
// //                     />
// //                 </div>

// //                 {activeTab === 'events' && (
// //                     <button
// //                         className="mlab-btn mlab-btn--primary"
// //                         onClick={() => {
// //                             setSelectedEvent(null);
// //                             setShowEventModal(true);
// //                         }}
// //                     >
// //                         <PlusCircle size={16} /> Create New Event
// //                     </button>
// //                 )}
// //             </div>

// //             {/* ─── EVENTS TAB CONTENT ─── */}
// //             {activeTab === 'events' && (
// //                 <div className="mlab-table-wrap">
// //                     <table className="mlab-table">
// //                         <thead>
// //                             <tr>
// //                                 <th>Event Name & Date</th>
// //                                 <th>Location</th>
// //                                 <th>Capacity</th>
// //                                 <th>Custom Fields</th>
// //                                 <th className="att-th--right">Action</th>
// //                             </tr>
// //                         </thead>
// //                         <tbody>
// //                             {filteredEvents.length > 0 ? filteredEvents.map(event => {
// //                                 const diffDays = getEventDaysCount(event.date, (event as any).endDate);
// //                                 const totalCheckins = event.currentCheckIns || 0;
// //                                 const displayCheckins = diffDays > 1 ? Math.round(totalCheckins / diffDays) : totalCheckins;
// //                                 const capacityLabel = diffDays > 1 ? 'Avg/Day' : 'Checked In';

// //                                 const capacityPercent = event.maxCapacity ? Math.round((displayCheckins / event.maxCapacity) * 100) : 0;
// //                                 let badgeBg = '#ecfccb';
// //                                 let badgeColor = '#65a30d';
// //                                 let badgeBorder = '#d9f99d';

// //                                 if (capacityPercent >= 100) {
// //                                     badgeBg = '#fee2e2';
// //                                     badgeColor = '#dc2626';
// //                                     badgeBorder = '#fecaca';
// //                                 } else if (capacityPercent >= 80) {
// //                                     badgeBg = '#fef3c7';
// //                                     badgeColor = '#d97706';
// //                                     badgeBorder = '#fde68a';
// //                                 }

// //                                 return (
// //                                     <tr key={event.id}>
// //                                         <td>
// //                                             <div style={{ fontWeight: 600, color: 'var(--mlab-blue)' }}>{event.eventName}</div>
// //                                             {event.eventType && (
// //                                                 <div style={{ fontSize: '0.7rem', color: 'var(--mlab-green)', fontWeight: 'bold', textTransform: 'uppercase', marginTop: '2px' }}>
// //                                                     {event.eventType}
// //                                                 </div>
// //                                             )}
// //                                             <div style={{ fontSize: '0.75rem', color: 'var(--mlab-grey)', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '4px' }}>
// //                                                 <Calendar size={12} color="#94a3b8" />
// //                                                 {formatEventDuration(event.date, (event as any).endDate)}
// //                                             </div>
// //                                         </td>
// //                                         <td>
// //                                             <div style={{ fontSize: '0.85rem' }}>{event.location.split(',')[0]}</div>
// //                                         </td>
// //                                         <td>
// //                                             <span className="att-badge" style={{ background: badgeBg, color: badgeColor, border: `1px solid ${badgeBorder}` }}>
// //                                                 {displayCheckins} / {event.maxCapacity} {capacityLabel}
// //                                             </span>
// //                                             {diffDays > 1 && (
// //                                                 <div style={{ fontSize: '0.65rem', color: 'var(--mlab-grey)', marginTop: '4px', textAlign: 'center', fontWeight: 500 }}>
// //                                                     {totalCheckins} Total Scans
// //                                                 </div>
// //                                             )}
// //                                         </td>
// //                                         <td>
// //                                             <span style={{ fontSize: '0.75rem', color: 'var(--mlab-grey)' }}>
// //                                                 {event.guestFormBlueprint?.length || 0} Extra Question(s)
// //                                             </span>
// //                                         </td>
// //                                         <td className="att-td--right">
// //                                             <button
// //                                                 className="cdp-btn cdp-btn--sky"
// //                                                 onClick={() => {
// //                                                     setSelectedEvent(event);
// //                                                     setShowEventModal(true);
// //                                                 }}
// //                                                 title="Edit Event"
// //                                             >
// //                                                 <Settings size={14} />
// //                                             </button>

// //                                             <button
// //                                                 className="cdp-btn cdp-btn--outline"
// //                                                 style={{ marginLeft: 8 }}
// //                                                 onClick={() => handleDuplicateEvent(event)}
// //                                                 title="Duplicate Event"
// //                                             >
// //                                                 <Copy size={14} />
// //                                             </button>

// //                                             <button
// //                                                 className="cdp-btn cdp-btn--outline"
// //                                                 style={{ marginLeft: 8, paddingLeft: 12, paddingRight: 12 }}
// //                                                 onClick={() => navigate(`/admin/ecosystem/event/${event.id}`)}
// //                                             >
// //                                                 <Users size={14} /> Roster
// //                                             </button>

// //                                             <button
// //                                                 className="mlab-btn mlab-btn--sm"
// //                                                 style={{ marginLeft: '8px', background: 'var(--mlab-blue)', color: 'white' }}
// //                                                 onClick={() => window.open(`/event-kiosk/${event.id}`, '_blank')}
// //                                                 title="Open TV Kiosk"
// //                                             >
// //                                                 <QrCode size={14} />
// //                                             </button>
// //                                         </td>
// //                                     </tr>
// //                                 );
// //                             }) : (
// //                                 <tr>
// //                                     <td colSpan={5} style={{ padding: '3rem', textAlign: 'center', color: 'var(--mlab-grey)' }}>
// //                                         No events found. Click "Create New Event" to get started.
// //                                     </td>
// //                                 </tr>
// //                             )}
// //                         </tbody>
// //                     </table>
// //                 </div>
// //             )}

// //             {/* ─── GUESTS TAB CONTENT ─── */}
// //             {activeTab === 'guests' && (
// //                 <div className="mlab-table-wrap">
// //                     <table className="mlab-table">
// //                         <thead>
// //                             <tr>
// //                                 <th>Guest Name</th>
// //                                 <th>Email Address</th>
// //                                 <th>Mobile</th>
// //                                 <th>Status</th>
// //                             </tr>
// //                         </thead>
// //                         <tbody>
// //                             {filteredGuests.length > 0 ? filteredGuests.map(guest => (
// //                                 <tr key={guest.email}>
// //                                     <td><div style={{ fontWeight: 600 }}>{guest.firstName} {guest.lastName}</div></td>
// //                                     <td>{guest.email}</td>
// //                                     <td>{guest.phone}</td>
// //                                     <td>
// //                                         <span className="att-badge att-badge--present">
// //                                             <CheckCircle size={11} /> Verified CRM Profile
// //                                         </span>
// //                                     </td>
// //                                 </tr>
// //                             )) : (
// //                                 <tr>
// //                                     <td colSpan={4} style={{ padding: '3rem', textAlign: 'center', color: 'var(--mlab-grey)' }}>
// //                                         No guests found. Data will populate once visitors start checking in.
// //                                     </td>
// //                                 </tr>
// //                             )}
// //                         </tbody>
// //                     </table>
// //                 </div>
// //             )}
// //         </div>
// //     );
// // };

// // // // src/components/AdminPortal/EcosystemDashboard/EcosystemDashboard.tsx

// // // import React, { useState, useEffect, useMemo } from 'react';
// // // import { createPortal } from 'react-dom';
// // // import { doc, collection, setDoc, updateDoc, onSnapshot, query, orderBy } from 'firebase/firestore';
// // // import {
// // //     Calendar, Users, Search, PlusCircle, QrCode,
// // //     Settings, CheckCircle, Globe, Database, Copy, TrendingUp, Activity, Target, X, Save, Edit3, Trash2
// // // } from 'lucide-react';
// // // import { db } from '../../../lib/firebase';
// // // import Loader from '../../../components/common/Loader/Loader';
// // // import { useToast } from '../../../components/common/Toast/Toast';
// // // import { useStore } from '../../../store/useStore';

// // // import { EventBuilderModal } from './EventBuilderModal';

// // // import '../../../components/views/LearnersView/LearnersView.css';
// // // import "../../../pages/FacilitatorDashboard/AttendanceRegister/AttendanceHistoryList.css";
// // // import type { EcosystemEvent } from '../../../types/ecosystem.types';
// // // import { useNavigate } from 'react-router-dom';
// // // import moment from 'moment';

// // // // ─── SMART DATE & CAPACITY HELPERS ───

// // // const getEventDaysCount = (startIso: string, endIso?: string) => {
// // //     if (!startIso) return 1;
// // //     const start = new Date(startIso);
// // //     const end = endIso ? new Date(endIso) : start;

// // //     start.setHours(0, 0, 0, 0);
// // //     end.setHours(0, 0, 0, 0);

// // //     return Math.max(1, Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1);
// // // };

// // // const formatEventDuration = (startIso: string, endIso?: string) => {
// // //     if (!startIso) return "Date TBD";
// // //     const start = new Date(startIso);
// // //     const end = endIso ? new Date(endIso) : start;

// // //     const diffDays = getEventDaysCount(startIso, endIso);
// // //     const startStr = start.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' });

// // //     if (diffDays <= 1) return startStr;

// // //     if (start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear()) {
// // //         const monthYear = start.toLocaleDateString('en-ZA', { month: 'short', year: 'numeric' });
// // //         return `${start.getDate()} – ${end.getDate()} ${monthYear} (${diffDays} Days)`;
// // //     }

// // //     const endStr = end.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' });
// // //     return `${startStr} – ${endStr} (${diffDays} Days)`;
// // // };

// // // export const EcosystemDashboard: React.FC = () => {
// // //     const toast = useToast();
// // //     const { programmes, user } = useStore();
// // //     const navigate = useNavigate();

// // //     // ─── TABS & LOADING STATE ───
// // //     const [activeTab, setActiveTab] = useState<'events' | 'guests'>('events');
// // //     const [isLoading, setIsLoading] = useState(true);

// // //     // ─── MODAL STATES ───
// // //     const [showEventModal, setShowEventModal] = useState(false);
// // //     const [selectedEvent, setSelectedEvent] = useState<EcosystemEvent | null>(null);
// // //     const [showKpiModal, setShowKpiModal] = useState(false);

// // //     // ─── DATA STATES ───
// // //     const [events, setEvents] = useState<EcosystemEvent[]>([]);
// // //     const [guests, setGuests] = useState<any[]>([]);
// // //     const [searchTerm, setSearchTerm] = useState('');

// // //     // 🚀 NEW: State for MULTIPLE Targets
// // //     const [targets, setTargets] = useState<any[]>([]);
// // //     const [kpiForm, setKpiForm] = useState<any>(null);

// // //     useEffect(() => {
// // //         setIsLoading(true);

// // //         // 1. Sync Events
// // //         const eventsQuery = query(collection(db, 'events'), orderBy('date', 'desc'));
// // //         const unsubscribeEvents = onSnapshot(eventsQuery, (snapshot) => {
// // //             const fetchedEvents = snapshot.docs.map(doc => ({
// // //                 id: doc.id,
// // //                 ...doc.data()
// // //             })) as EcosystemEvent[];
// // //             setEvents(fetchedEvents);
// // //             setIsLoading(false);
// // //         }, (error) => {
// // //             console.error("Error fetching events:", error);
// // //             toast.error("Failed to load ecosystem events.");
// // //             setIsLoading(false);
// // //         });

// // //         // 2. Sync Guests
// // //         const guestsQuery = query(collection(db, 'ecosystem_guests'), orderBy('lastSeenAt', 'desc'));
// // //         const unsubscribeGuests = onSnapshot(guestsQuery, (snapshot) => {
// // //             const fetchedGuests = snapshot.docs.map(doc => ({
// // //                 email: doc.id,
// // //                 ...doc.data()
// // //             }));
// // //             setGuests(fetchedGuests);
// // //         });

// // //         // 3. Sync KPI Targets Array
// // //         const unsubscribeKpi = onSnapshot(doc(db, 'system_settings', 'ecosystem_kpi'), (docSnap) => {
// // //             if (docSnap.exists()) {
// // //                 const data = docSnap.data();
// // //                 setTargets(data.targets || []);
// // //             } else {
// // //                 setTargets([]);
// // //             }
// // //         });

// // //         return () => {
// // //             unsubscribeEvents();
// // //             unsubscribeGuests();
// // //             unsubscribeKpi();
// // //         };
// // //         // eslint-disable-next-line react-hooks/exhaustive-deps
// // //     }, []);

// // //     // ─── EVENT HANDLERS ───
// // //     const handleSaveEvent = async (eventData: Partial<EcosystemEvent>) => {
// // //         try {
// // //             const isEdit = !!selectedEvent?.id;
// // //             const eventRef = isEdit
// // //                 ? doc(db, 'events', selectedEvent.id)
// // //                 : doc(collection(db, 'events'));

// // //             const payload: any = {
// // //                 ...eventData,
// // //                 updatedAt: new Date().toISOString(),
// // //             };

// // //             if (isEdit) {
// // //                 await updateDoc(eventRef, payload);
// // //                 toast.success("Event updated successfully!");
// // //             } else {
// // //                 payload.id = eventRef.id;
// // //                 payload.createdBy = user?.uid || 'admin';
// // //                 payload.currentCheckIns = 0;
// // //                 payload.status = 'active';
// // //                 payload.createdAt = new Date().toISOString();

// // //                 await setDoc(eventRef, payload);
// // //                 toast.success("Event created successfully!");
// // //             }

// // //             setShowEventModal(false);
// // //             setSelectedEvent(null);

// // //         } catch (error: any) {
// // //             console.error("Failed to save event:", error);
// // //             throw error;
// // //         }
// // //     };

// // //     const handleDuplicateEvent = (eventToCopy: EcosystemEvent) => {
// // //         const { id, currentCheckIns, createdAt, updatedAt, status, createdBy, ...clonedData } = eventToCopy as any;
// // //         const newEventDraft = {
// // //             ...clonedData,
// // //             eventName: `${clonedData.eventName} (Copy)`
// // //         } as EcosystemEvent;
// // //         setSelectedEvent(newEventDraft);
// // //         setShowEventModal(true);
// // //     };

// // //     // 🚀 MODAL HANDLERS FOR KPI TARGETS
// // //     const openKpiModal = (targetData?: any) => {
// // //         if (targetData) {
// // //             setKpiForm(targetData);
// // //         } else {
// // //             setKpiForm({
// // //                 id: `target_${Date.now()}`,
// // //                 title: "New Impact Target",
// // //                 startDate: moment().startOf('year').format('YYYY-MM-DD'),
// // //                 endDate: moment().endOf('year').format('YYYY-MM-DD'),
// // //                 targetAmount: 1000,
// // //                 offlineCarryover: 0
// // //             });
// // //         }
// // //         setShowKpiModal(true);
// // //     };

// // //     const handleSaveKpi = async () => {
// // //         try {
// // //             const existingIndex = targets.findIndex(t => t.id === kpiForm.id);
// // //             let updatedTargets = [...targets];

// // //             if (existingIndex >= 0) {
// // //                 updatedTargets[existingIndex] = kpiForm;
// // //             } else {
// // //                 updatedTargets.push(kpiForm);
// // //             }

// // //             await setDoc(doc(db, 'system_settings', 'ecosystem_kpi'), { targets: updatedTargets }, { merge: true });
// // //             toast.success("Impact Target saved successfully.");
// // //             setShowKpiModal(false);
// // //         } catch (error) {
// // //             console.error("Failed to save target config:", error);
// // //             toast.error("Failed to update target.");
// // //         }
// // //     };

// // //     const handleDeleteKpi = async (id: string) => {
// // //         if (!window.confirm("Are you sure you want to delete this target card?")) return;
// // //         try {
// // //             const updatedTargets = targets.filter(t => t.id !== id);
// // //             await setDoc(doc(db, 'system_settings', 'ecosystem_kpi'), { targets: updatedTargets }, { merge: true });
// // //             toast.success("Target deleted.");
// // //             setShowKpiModal(false);
// // //         } catch (error) {
// // //             console.error("Failed to delete target:", error);
// // //             toast.error("Failed to delete target.");
// // //         }
// // //     };

// // //     // 🚀 DYNAMIC MULTI-TARGET CALCULATION
// // //     const calculatedTargets = useMemo(() => {
// // //         return targets.map(target => {
// // //             const kpiStart = moment(target.startDate).startOf('day');
// // //             const kpiEnd = moment(target.endDate).endOf('day');
// // //             let kpiWindowImpact = 0;

// // //             events.forEach(e => {
// // //                 const checkins = e.currentCheckIns || 0;

// // //                 // Does this event explicitly link to this target?
// // //                 const isExplicitlyLinked = e.linkedTargets && e.linkedTargets.includes(target.id);
// // //                 // If it has no links, it defaults to catching any overlapping dates
// // //                 const hasNoLinks = !e.linkedTargets || e.linkedTargets.length === 0;
// // //                 const isDateOverlapping = e.date && moment(e.date).isBetween(kpiStart, kpiEnd, 'day', '[]');

// // //                 if (isExplicitlyLinked || (hasNoLinks && isDateOverlapping)) {
// // //                     kpiWindowImpact += checkins;
// // //                 }
// // //             });

// // //             const kpiTotalProgress = kpiWindowImpact + (Number(target.offlineCarryover) || 0);
// // //             const targetGoal = Number(target.targetAmount) || 1;
// // //             const progressPercent = Math.min(100, Math.round((kpiTotalProgress / targetGoal) * 100));

// // //             return { ...target, kpiTotalProgress, targetGoal, progressPercent };
// // //         }).sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
// // //     }, [events, targets]);

// // //     // Overall Totals for the 3 bottom cards
// // //     const { allTimeImpact, averageCapacity } = useMemo(() => {
// // //         let impact = 0;
// // //         let validCapacityEvents = 0;
// // //         let totalCapacityPercentage = 0;

// // //         events.forEach(e => {
// // //             impact += (e.currentCheckIns || 0);
// // //             if (e.maxCapacity && e.maxCapacity > 0) {
// // //                 const diffDays = getEventDaysCount(e.date, (e as any).endDate);
// // //                 const dailyCheckins = diffDays > 1 ? Math.round((e.currentCheckIns || 0) / diffDays) : (e.currentCheckIns || 0);
// // //                 totalCapacityPercentage += (dailyCheckins / e.maxCapacity);
// // //                 validCapacityEvents++;
// // //             }
// // //         });

// // //         return {
// // //             allTimeImpact: impact,
// // //             averageCapacity: validCapacityEvents > 0 ? Math.round((totalCapacityPercentage / validCapacityEvents) * 100) : 0
// // //         };
// // //     }, [events]);

// // //     const filteredEvents = events.filter(e =>
// // //         e.eventName.toLowerCase().includes(searchTerm.toLowerCase()) ||
// // //         e.location.toLowerCase().includes(searchTerm.toLowerCase()) ||
// // //         (e.eventType && e.eventType.toLowerCase().includes(searchTerm.toLowerCase()))
// // //     );

// // //     const filteredGuests = guests.filter(g =>
// // //         (g.firstName + ' ' + g.lastName).toLowerCase().includes(searchTerm.toLowerCase()) ||
// // //         g.email.toLowerCase().includes(searchTerm.toLowerCase())
// // //     );

// // //     const isSuperAdmin = (user as any)?.isSuperAdmin === true;

// // //     if (isLoading) {
// // //         return (
// // //             <div className="att-loader-wrap">
// // //                 <Loader message="Loading Ecosystem Data…" />
// // //             </div>
// // //         );
// // //     }

// // //     return (
// // //         <div className="att-root animate-fade-in">

// // //             {showEventModal && createPortal(
// // //                 <EventBuilderModal
// // //                     event={selectedEvent}
// // //                     programmes={programmes}
// // //                     availableTargets={targets} // 🚀 Pass targets to multi-selector
// // //                     onClose={() => {
// // //                         setShowEventModal(false);
// // //                         setSelectedEvent(null);
// // //                     }}
// // //                     onSave={handleSaveEvent}
// // //                 />,
// // //                 document.body
// // //             )}

// // //             {/* ─── TARGET SETTINGS MODAL ─── */}
// // //             {showKpiModal && kpiForm && createPortal(
// // //                 <div className="lfm-overlay" onClick={() => setShowKpiModal(false)} style={{ zIndex: 9999 }}>
// // //                     <div className="lfm-modal animate-fade-in" onClick={e => e.stopPropagation()} style={{ maxWidth: '450px' }}>
// // //                         <div className="lfm-header">
// // //                             <h2 className="lfm-header__title"><Target size={16} /> Configure Impact Target</h2>
// // //                             <button className="lfm-close-btn" onClick={() => setShowKpiModal(false)}><X size={20} /></button>
// // //                         </div>
// // //                         <div className="lfm-body" style={{ padding: '1.5rem', background: '#f8fafc' }}>
// // //                             <div className="mlab-form-group mb-4">
// // //                                 <label>Target Name / Title</label>
// // //                                 <input type="text" className="mlab-input bg-white" value={kpiForm.title} onChange={e => setKpiForm({ ...kpiForm, title: e.target.value })} placeholder="e.g. FY26 Ecosystem Impact" />
// // //                             </div>
// // //                             <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
// // //                                 <div className="mlab-form-group" style={{ flex: 1 }}>
// // //                                     <label>Start Date</label>
// // //                                     <input type="date" className="mlab-input bg-white" value={kpiForm.startDate} onChange={e => setKpiForm({ ...kpiForm, startDate: e.target.value })} />
// // //                                 </div>
// // //                                 <div className="mlab-form-group" style={{ flex: 1 }}>
// // //                                     <label>End Date</label>
// // //                                     <input type="date" className="mlab-input bg-white" value={kpiForm.endDate} onChange={e => setKpiForm({ ...kpiForm, endDate: e.target.value })} />
// // //                                 </div>
// // //                             </div>
// // //                             <div style={{ display: 'flex', gap: '1rem' }}>
// // //                                 <div className="mlab-form-group" style={{ flex: 1 }}>
// // //                                     <label>Target Goal Amount</label>
// // //                                     <input type="number" className="mlab-input bg-white" value={kpiForm.targetAmount} onChange={e => setKpiForm({ ...kpiForm, targetAmount: Number(e.target.value) })} />
// // //                                 </div>
// // //                                 <div className="mlab-form-group" style={{ flex: 1 }}>
// // //                                     <label>Offline Base Impact</label>
// // //                                     <input type="number" className="mlab-input bg-white" value={kpiForm.offlineCarryover} onChange={e => setKpiForm({ ...kpiForm, offlineCarryover: Number(e.target.value) })} />
// // //                                     <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>Add missing/historical data</span>
// // //                                 </div>
// // //                             </div>
// // //                         </div>

// // //                         <div className="lfm-footer" style={{ display: 'flex', justifyContent: targets.some(t => t.id === kpiForm.id) ? 'space-between' : 'flex-end' }}>
// // //                             {targets.some(t => t.id === kpiForm.id) && (
// // //                                 <button className="lfm-btn" style={{ color: 'var(--mlab-red)', background: 'transparent', padding: 0 }} onClick={() => handleDeleteKpi(kpiForm.id)}>
// // //                                     <Trash2 size={16} style={{ marginRight: '4px' }} /> Delete
// // //                                 </button>
// // //                             )}
// // //                             <div style={{ display: 'flex', gap: '8px' }}>
// // //                                 <button className="lfm-btn lfm-btn--ghost" onClick={() => setShowKpiModal(false)}>Cancel</button>
// // //                                 <button className="lfm-btn lfm-btn--primary" onClick={handleSaveKpi}><Save size={14} /> Save Target</button>
// // //                             </div>
// // //                         </div>
// // //                     </div>
// // //                 </div>,
// // //                 document.body
// // //             )}

// // //             {/* ─── HEADER TABS ─── */}
// // //             <div className="att-tabs" role="tablist">
// // //                 <button
// // //                     role="tab"
// // //                     className={`att-tab${activeTab === 'events' ? ' att-tab--active' : ''}`}
// // //                     onClick={() => { setActiveTab('events'); setSearchTerm(''); }}
// // //                 >
// // //                     <Calendar size={14} /> Ecosystem Events
// // //                 </button>
// // //                 <button
// // //                     role="tab"
// // //                     className={`att-tab${activeTab === 'guests' ? ' att-tab--active' : ''}`}
// // //                     onClick={() => { setActiveTab('guests'); setSearchTerm(''); }}
// // //                 >
// // //                     <Database size={14} /> Guest CRM Ledger
// // //                 </button>
// // //             </div>


// // //             {/* 🚀 HORIZONTAL KPI TARGET SCROLL 🚀 */}
// // //             <div style={{ display: 'flex', gap: '1rem', overflowX: 'auto', paddingBottom: '1rem', marginBottom: '0.5rem', scrollbarWidth: 'none' }}>
// // //                 {calculatedTargets.map(t => (
// // //                     <div key={t.id} style={{ minWidth: '350px', flex: '0 0 auto', background: '#0f172a', padding: '1.5rem', borderRadius: '16px', color: 'white', position: 'relative', overflow: 'hidden', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)' }}>
// // //                         <div style={{ position: 'absolute', right: '-10%', top: '-20%', opacity: 0.05 }}><Target size={180} color="white" /></div>

// // //                         <div style={{ position: 'relative', zIndex: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
// // //                             <div style={{ flex: 1 }}>
// // //                                 <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
// // //                                     <div style={{ background: 'rgba(255,255,255,0.1)', padding: '4px 10px', borderRadius: '20px', fontSize: '0.7rem', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
// // //                                         {moment(t.startDate).format('D MMM YYYY')} — {moment(t.endDate).format('D MMM YYYY')}
// // //                                     </div>
// // //                                 </div>
// // //                                 <h2 style={{ margin: '0 0 1rem 0', fontSize: '1.25rem', fontWeight: 700, fontFamily: 'var(--font-heading)' }}>
// // //                                     {t.title}
// // //                                 </h2>

// // //                                 <div style={{ marginBottom: '10px' }}>
// // //                                     <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', alignItems: 'flex-end' }}>
// // //                                         <div style={{ fontSize: '2.2rem', fontWeight: 800, lineHeight: 1, fontFamily: 'var(--font-heading)', color: '#10b981' }}>
// // //                                             {t.kpiTotalProgress.toLocaleString()} <span style={{ fontSize: '1.1rem', color: '#94a3b8', fontWeight: 600 }}>/ {t.targetGoal.toLocaleString()}</span>
// // //                                         </div>
// // //                                         <div style={{ fontSize: '1rem', fontWeight: 700, color: 'white' }}>{t.progressPercent}%</div>
// // //                                     </div>

// // //                                     <div style={{ height: '10px', background: 'rgba(255,255,255,0.1)', borderRadius: '5px', overflow: 'hidden' }}>
// // //                                         <div style={{
// // //                                             width: `${t.progressPercent}%`,
// // //                                             height: '100%',
// // //                                             background: t.progressPercent >= 100 ? '#34d399' : '#10b981',
// // //                                             borderRadius: '5px',
// // //                                             transition: 'width 1s ease-in-out'
// // //                                         }} />
// // //                                     </div>
// // //                                 </div>
// // //                             </div>

// // //                             <button
// // //                                 onClick={() => openKpiModal(t)}
// // //                                 style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: 'white', padding: '6px 12px', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', zIndex: 10 }}
// // //                             >
// // //                                 <Edit3 size={14} />
// // //                             </button>
// // //                         </div>
// // //                     </div>
// // //                 ))}

// // //                 {/* Add New Target Button Card */}
// // //                 <button
// // //                     onClick={() => openKpiModal()}
// // //                     style={{ minWidth: '180px', flex: '0 0 auto', background: '#f8fafc', border: '2px dashed #cbd5e1', borderRadius: '16px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--mlab-grey)', cursor: 'pointer', gap: '8px', transition: 'all 0.2s', padding: '2rem' }}
// // //                 >
// // //                     <PlusCircle size={28} />
// // //                     <span style={{ fontWeight: 600, fontSize: '0.9rem', textAlign: 'center' }}>Add Impact Target</span>
// // //                 </button>
// // //             </div>

// // //             {/* ─── 3-COLUMN STAT CARDS (GLOBAL TOTALS) ─── */}
// // //             <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
// // //                 <div style={{ background: 'white', padding: '1.25rem', borderRadius: '12px', border: '1px solid var(--mlab-border)', borderLeft: '4px solid #8b5cf6', display: 'flex', alignItems: 'center', gap: '1rem', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.02)' }}>
// // //                     <div style={{ background: '#ede9fe', padding: '12px', borderRadius: '50%' }}><TrendingUp size={24} color="#8b5cf6" /></div>
// // //                     <div>
// // //                         <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--mlab-grey)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>All-Time App Impact</p>
// // //                         <h3 style={{ margin: '4px 0 0', color: '#8b5cf6', fontSize: '1.5rem', fontFamily: 'var(--font-heading)' }}>{allTimeImpact.toLocaleString()} <span style={{ fontSize: '0.85rem', color: 'var(--mlab-grey)' }}>Engagements</span></h3>
// // //                     </div>
// // //                 </div>

// // //                 <div style={{ background: 'white', padding: '1.25rem', borderRadius: '12px', border: '1px solid var(--mlab-border)', borderLeft: '4px solid var(--mlab-blue)', display: 'flex', alignItems: 'center', gap: '1rem', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.02)' }}>
// // //                     <div style={{ background: 'var(--mlab-light-blue)', padding: '12px', borderRadius: '50%' }}><Globe size={24} color="var(--mlab-blue)" /></div>
// // //                     <div>
// // //                         <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--mlab-grey)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Events</p>
// // //                         <h3 style={{ margin: '4px 0 0', color: 'var(--mlab-blue)', fontSize: '1.5rem', fontFamily: 'var(--font-heading)' }}>{events.length} <span style={{ fontSize: '0.85rem', color: 'var(--mlab-grey)' }}>Hosted</span></h3>
// // //                     </div>
// // //                 </div>

// // //                 <div style={{ background: 'white', padding: '1.25rem', borderRadius: '12px', border: '1px solid var(--mlab-border)', borderLeft: '4px solid var(--mlab-green)', display: 'flex', alignItems: 'center', gap: '1rem', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.02)' }}>
// // //                     <div style={{ background: 'var(--mlab-green-bg)', padding: '12px', borderRadius: '50%' }}><Users size={24} color="var(--mlab-green-dark)" /></div>
// // //                     <div>
// // //                         <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--mlab-grey)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Unique Guests</p>
// // //                         <h3 style={{ margin: '4px 0 0', color: 'var(--mlab-green-dark)', fontSize: '1.5rem', fontFamily: 'var(--font-heading)' }}>{guests.length} <span style={{ fontSize: '0.85rem', color: 'var(--mlab-grey)' }}>Profiles</span></h3>
// // //                     </div>
// // //                 </div>

// // //                 <div style={{ background: 'white', padding: '1.25rem', borderRadius: '12px', border: '1px solid var(--mlab-border)', borderLeft: '4px solid #f59e0b', display: 'flex', alignItems: 'center', gap: '1rem', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.02)' }}>
// // //                     <div style={{ background: '#fef3c7', padding: '12px', borderRadius: '50%' }}><Activity size={24} color="#d97706" /></div>
// // //                     <div>
// // //                         <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--mlab-grey)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Average Capacity</p>
// // //                         <h3 style={{ margin: '4px 0 0', color: '#d97706', fontSize: '1.5rem', fontFamily: 'var(--font-heading)' }}>{averageCapacity}% <span style={{ fontSize: '0.85rem', color: 'var(--mlab-grey)' }}>Fill Rate</span></h3>
// // //                     </div>
// // //                 </div>
// // //             </div>

// // //             {/* ─── SEARCH & TOOLBAR ─── */}
// // //             <div className="mlab-toolbar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.5rem' }}>
// // //                 <div className="mlab-search" style={{ minWidth: '250px', background: '#f8fafc', height: 35, borderRadius: 0, border: '1px solid var(--mlab-border)', padding: '4px 12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
// // //                     <Search size={18} color="var(--mlab-grey)" />
// // //                     <input
// // //                         type="text"
// // //                         placeholder={activeTab === 'events' ? "Search events or locations..." : "Search guests by name or email..."}
// // //                         value={searchTerm}
// // //                         onChange={(e) => setSearchTerm(e.target.value)}
// // //                         style={{ border: 'none', outline: 'none', background: 'transparent', width: '100%' }}
// // //                     />
// // //                 </div>

// // //                 {activeTab === 'events' && (
// // //                     <button
// // //                         className="mlab-btn mlab-btn--primary"
// // //                         onClick={() => {
// // //                             setSelectedEvent(null);
// // //                             setShowEventModal(true);
// // //                         }}
// // //                     >
// // //                         <PlusCircle size={16} /> Create New Event
// // //                     </button>
// // //                 )}
// // //             </div>

// // //             {/* ─── EVENTS TAB CONTENT ─── */}
// // //             {activeTab === 'events' && (
// // //                 <div className="mlab-table-wrap">
// // //                     <table className="mlab-table">
// // //                         <thead>
// // //                             <tr>
// // //                                 <th>Event Name & Date</th>
// // //                                 <th>Location</th>
// // //                                 <th>Capacity</th>
// // //                                 <th>Custom Fields</th>
// // //                                 <th className="att-th--right">Action</th>
// // //                             </tr>
// // //                         </thead>
// // //                         <tbody>
// // //                             {filteredEvents.length > 0 ? filteredEvents.map(event => {
// // //                                 const diffDays = getEventDaysCount(event.date, (event as any).endDate);
// // //                                 const totalCheckins = event.currentCheckIns || 0;
// // //                                 const displayCheckins = diffDays > 1 ? Math.round(totalCheckins / diffDays) : totalCheckins;
// // //                                 const capacityLabel = diffDays > 1 ? 'Avg/Day' : 'Checked In';

// // //                                 const capacityPercent = event.maxCapacity ? Math.round((displayCheckins / event.maxCapacity) * 100) : 0;
// // //                                 let badgeBg = '#ecfccb';
// // //                                 let badgeColor = '#65a30d';
// // //                                 let badgeBorder = '#d9f99d';

// // //                                 if (capacityPercent >= 100) {
// // //                                     badgeBg = '#fee2e2';
// // //                                     badgeColor = '#dc2626';
// // //                                     badgeBorder = '#fecaca';
// // //                                 } else if (capacityPercent >= 80) {
// // //                                     badgeBg = '#fef3c7';
// // //                                     badgeColor = '#d97706';
// // //                                     badgeBorder = '#fde68a';
// // //                                 }

// // //                                 return (
// // //                                     <tr key={event.id}>
// // //                                         <td>
// // //                                             <div style={{ fontWeight: 600, color: 'var(--mlab-blue)' }}>{event.eventName}</div>
// // //                                             {event.eventType && (
// // //                                                 <div style={{ fontSize: '0.7rem', color: 'var(--mlab-green)', fontWeight: 'bold', textTransform: 'uppercase', marginTop: '2px' }}>
// // //                                                     {event.eventType}
// // //                                                 </div>
// // //                                             )}
// // //                                             <div style={{ fontSize: '0.75rem', color: 'var(--mlab-grey)', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '4px' }}>
// // //                                                 <Calendar size={12} color="#94a3b8" />
// // //                                                 {formatEventDuration(event.date, (event as any).endDate)}
// // //                                             </div>
// // //                                         </td>
// // //                                         <td>
// // //                                             <div style={{ fontSize: '0.85rem' }}>{event.location.split(',')[0]}</div>
// // //                                         </td>
// // //                                         <td>
// // //                                             <span className="att-badge" style={{ background: badgeBg, color: badgeColor, border: `1px solid ${badgeBorder}` }}>
// // //                                                 {displayCheckins} / {event.maxCapacity} {capacityLabel}
// // //                                             </span>
// // //                                             {diffDays > 1 && (
// // //                                                 <div style={{ fontSize: '0.65rem', color: 'var(--mlab-grey)', marginTop: '4px', textAlign: 'center', fontWeight: 500 }}>
// // //                                                     {totalCheckins} Total Scans
// // //                                                 </div>
// // //                                             )}
// // //                                         </td>
// // //                                         <td>
// // //                                             <span style={{ fontSize: '0.75rem', color: 'var(--mlab-grey)' }}>
// // //                                                 {event.guestFormBlueprint?.length || 0} Extra Question(s)
// // //                                             </span>
// // //                                         </td>
// // //                                         <td className="att-td--right">
// // //                                             <button
// // //                                                 className="cdp-btn cdp-btn--sky"
// // //                                                 onClick={() => {
// // //                                                     setSelectedEvent(event);
// // //                                                     setShowEventModal(true);
// // //                                                 }}
// // //                                                 title="Edit Event"
// // //                                             >
// // //                                                 <Settings size={14} />
// // //                                             </button>

// // //                                             <button
// // //                                                 className="cdp-btn cdp-btn--outline"
// // //                                                 style={{ marginLeft: 8 }}
// // //                                                 onClick={() => handleDuplicateEvent(event)}
// // //                                                 title="Duplicate Event"
// // //                                             >
// // //                                                 <Copy size={14} />
// // //                                             </button>

// // //                                             <button
// // //                                                 className="cdp-btn cdp-btn--outline"
// // //                                                 style={{ marginLeft: 8, paddingLeft: 12, paddingRight: 12 }}
// // //                                                 onClick={() => navigate(`/admin/ecosystem/event/${event.id}`)}
// // //                                             >
// // //                                                 <Users size={14} /> Roster
// // //                                             </button>

// // //                                             <button
// // //                                                 className="mlab-btn mlab-btn--sm"
// // //                                                 style={{ marginLeft: '8px', background: 'var(--mlab-blue)', color: 'white' }}
// // //                                                 onClick={() => window.open(`/event-kiosk/${event.id}`, '_blank')}
// // //                                                 title="Open TV Kiosk"
// // //                                             >
// // //                                                 <QrCode size={14} />
// // //                                             </button>
// // //                                         </td>
// // //                                     </tr>
// // //                                 );
// // //                             }) : (
// // //                                 <tr>
// // //                                     <td colSpan={5} style={{ padding: '3rem', textAlign: 'center', color: 'var(--mlab-grey)' }}>
// // //                                         No events found. Click "Create New Event" to get started.
// // //                                     </td>
// // //                                 </tr>
// // //                             )}
// // //                         </tbody>
// // //                     </table>
// // //                 </div>
// // //             )}

// // //             {/* ─── GUESTS TAB CONTENT ─── */}
// // //             {activeTab === 'guests' && (
// // //                 <div className="mlab-table-wrap">
// // //                     <table className="mlab-table">
// // //                         <thead>
// // //                             <tr>
// // //                                 <th>Guest Name</th>
// // //                                 <th>Email Address</th>
// // //                                 <th>Mobile</th>
// // //                                 <th>Status</th>
// // //                             </tr>
// // //                         </thead>
// // //                         <tbody>
// // //                             {filteredGuests.length > 0 ? filteredGuests.map(guest => (
// // //                                 <tr key={guest.email}>
// // //                                     <td><div style={{ fontWeight: 600 }}>{guest.firstName} {guest.lastName}</div></td>
// // //                                     <td>{guest.email}</td>
// // //                                     <td>{guest.phone}</td>
// // //                                     <td>
// // //                                         <span className="att-badge att-badge--present">
// // //                                             <CheckCircle size={11} /> Verified CRM Profile
// // //                                         </span>
// // //                                     </td>
// // //                                 </tr>
// // //                             )) : (
// // //                                 <tr>
// // //                                     <td colSpan={4} style={{ padding: '3rem', textAlign: 'center', color: 'var(--mlab-grey)' }}>
// // //                                         No guests found. Data will populate once visitors start checking in.
// // //                                     </td>
// // //                                 </tr>
// // //                             )}
// // //                         </tbody>
// // //                     </table>
// // //                 </div>
// // //             )}
// // //         </div>
// // //     );
// // // };


// // // // // src/components/AdminPortal/EcosystemDashboard/EcosystemDashboard.tsx

// // // // import React, { useState, useEffect, useMemo } from 'react';
// // // // import { createPortal } from 'react-dom';
// // // // import { doc, collection, setDoc, updateDoc, onSnapshot, query, orderBy } from 'firebase/firestore';
// // // // import {
// // // //     Calendar, Users, Search, PlusCircle, QrCode,
// // // //     Settings, CheckCircle, Globe, Database, Copy, TrendingUp, Activity, Target, X, Save, Edit3
// // // // } from 'lucide-react';
// // // // import { db } from '../../../lib/firebase';
// // // // import Loader from '../../../components/common/Loader/Loader';
// // // // import { useToast } from '../../../components/common/Toast/Toast';
// // // // import { useStore } from '../../../store/useStore';

// // // // import { EventBuilderModal } from './EventBuilderModal';

// // // // import '../../../components/views/LearnersView/LearnersView.css';
// // // // import "../../../pages/FacilitatorDashboard/AttendanceRegister/AttendanceHistoryList.css";
// // // // import type { EcosystemEvent } from '../../../types/ecosystem.types';
// // // // import { useNavigate } from 'react-router-dom';
// // // // import moment from 'moment';

// // // // // ─── SMART DATE & CAPACITY HELPERS ───

// // // // const getEventDaysCount = (startIso: string, endIso?: string) => {
// // // //     if (!startIso) return 1;
// // // //     const start = new Date(startIso);
// // // //     const end = endIso ? new Date(endIso) : start;

// // // //     start.setHours(0, 0, 0, 0);
// // // //     end.setHours(0, 0, 0, 0);

// // // //     return Math.max(1, Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1);
// // // // };

// // // // const formatEventDuration = (startIso: string, endIso?: string) => {
// // // //     if (!startIso) return "Date TBD";
// // // //     const start = new Date(startIso);
// // // //     const end = endIso ? new Date(endIso) : start;

// // // //     const diffDays = getEventDaysCount(startIso, endIso);
// // // //     const startStr = start.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' });

// // // //     if (diffDays <= 1) return startStr;

// // // //     if (start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear()) {
// // // //         const monthYear = start.toLocaleDateString('en-ZA', { month: 'short', year: 'numeric' });
// // // //         return `${start.getDate()} – ${end.getDate()} ${monthYear} (${diffDays} Days)`;
// // // //     }

// // // //     const endStr = end.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' });
// // // //     return `${startStr} – ${endStr} (${diffDays} Days)`;
// // // // };

// // // // // ─── DEFAULT KPI SETTINGS ───
// // // // const DEFAULT_KPI = {
// // // //     title: "FY26/27 Ecosystem Impact Goal",
// // // //     startDate: moment().startOf('year').format('YYYY-MM-DD'),
// // // //     endDate: moment().endOf('year').format('YYYY-MM-DD'),
// // // //     targetAmount: 1000,
// // // //     offlineCarryover: 0 // Used to add manual offline counts (like your 788)
// // // // };

// // // // export const EcosystemDashboard: React.FC = () => {
// // // //     const toast = useToast();
// // // //     const { programmes, user } = useStore();
// // // //     const navigate = useNavigate();

// // // //     // ─── TABS & LOADING STATE ───
// // // //     const [activeTab, setActiveTab] = useState<'events' | 'guests'>('events');
// // // //     const [isLoading, setIsLoading] = useState(true);

// // // //     // ─── MODAL STATES ───
// // // //     const [showEventModal, setShowEventModal] = useState(false);
// // // //     const [selectedEvent, setSelectedEvent] = useState<EcosystemEvent | null>(null);
// // // //     const [showKpiModal, setShowKpiModal] = useState(false);

// // // //     // ─── DATA STATES ───
// // // //     const [events, setEvents] = useState<EcosystemEvent[]>([]);
// // // //     const [guests, setGuests] = useState<any[]>([]);
// // // //     const [searchTerm, setSearchTerm] = useState('');
// // // //     const [kpiConfig, setKpiConfig] = useState<any>(DEFAULT_KPI);
// // // //     const [kpiForm, setKpiForm] = useState<any>(DEFAULT_KPI);

// // // //     useEffect(() => {
// // // //         setIsLoading(true);

// // // //         // 1. Sync Events
// // // //         const eventsQuery = query(collection(db, 'events'), orderBy('date', 'desc'));
// // // //         const unsubscribeEvents = onSnapshot(eventsQuery, (snapshot) => {
// // // //             const fetchedEvents = snapshot.docs.map(doc => ({
// // // //                 id: doc.id,
// // // //                 ...doc.data()
// // // //             })) as EcosystemEvent[];
// // // //             setEvents(fetchedEvents);
// // // //             setIsLoading(false);
// // // //         }, (error) => {
// // // //             console.error("Error fetching events:", error);
// // // //             toast.error("Failed to load ecosystem events.");
// // // //             setIsLoading(false);
// // // //         });

// // // //         // 2. Sync Guests
// // // //         const guestsQuery = query(collection(db, 'ecosystem_guests'), orderBy('lastSeenAt', 'desc'));
// // // //         const unsubscribeGuests = onSnapshot(guestsQuery, (snapshot) => {
// // // //             const fetchedGuests = snapshot.docs.map(doc => ({
// // // //                 email: doc.id,
// // // //                 ...doc.data()
// // // //             }));
// // // //             setGuests(fetchedGuests);
// // // //         });

// // // //         // 3. Sync KPI Target Config
// // // //         const unsubscribeKpi = onSnapshot(doc(db, 'system_settings', 'ecosystem_kpi'), (docSnap) => {
// // // //             if (docSnap.exists()) {
// // // //                 const data = docSnap.data();
// // // //                 setKpiConfig(data);
// // // //                 setKpiForm(data);
// // // //             }
// // // //         });

// // // //         return () => {
// // // //             unsubscribeEvents();
// // // //             unsubscribeGuests();
// // // //             unsubscribeKpi();
// // // //         };
// // // //         // eslint-disable-next-line react-hooks/exhaustive-deps
// // // //     }, []);

// // // //     // ─── EVENT HANDLERS ───
// // // //     const handleSaveEvent = async (eventData: Partial<EcosystemEvent>) => {
// // // //         try {
// // // //             const isEdit = !!selectedEvent?.id;
// // // //             const eventRef = isEdit
// // // //                 ? doc(db, 'events', selectedEvent.id)
// // // //                 : doc(collection(db, 'events'));

// // // //             const payload: any = {
// // // //                 ...eventData,
// // // //                 updatedAt: new Date().toISOString(),
// // // //             };

// // // //             if (isEdit) {
// // // //                 await updateDoc(eventRef, payload);
// // // //                 toast.success("Event updated successfully!");
// // // //             } else {
// // // //                 payload.id = eventRef.id;
// // // //                 payload.createdBy = user?.uid || 'admin';
// // // //                 payload.currentCheckIns = 0;
// // // //                 payload.status = 'active';
// // // //                 payload.createdAt = new Date().toISOString();

// // // //                 await setDoc(eventRef, payload);
// // // //                 toast.success("Event created successfully!");
// // // //             }

// // // //             setShowEventModal(false);
// // // //             setSelectedEvent(null);

// // // //         } catch (error: any) {
// // // //             console.error("Failed to save event:", error);
// // // //             throw error;
// // // //         }
// // // //     };

// // // //     const handleDuplicateEvent = (eventToCopy: EcosystemEvent) => {
// // // //         const { id, currentCheckIns, createdAt, updatedAt, status, createdBy, ...clonedData } = eventToCopy as any;
// // // //         const newEventDraft = {
// // // //             ...clonedData,
// // // //             eventName: `${clonedData.eventName} (Copy)`
// // // //         } as EcosystemEvent;
// // // //         setSelectedEvent(newEventDraft);
// // // //         setShowEventModal(true);
// // // //     };

// // // //     const handleSaveKpi = async () => {
// // // //         try {
// // // //             await setDoc(doc(db, 'system_settings', 'ecosystem_kpi'), kpiForm);
// // // //             toast.success("KPI Target updated successfully.");
// // // //             setShowKpiModal(false);
// // // //         } catch (error) {
// // // //             console.error("Failed to save KPI config:", error);
// // // //             toast.error("Failed to update target.");
// // // //         }
// // // //     };

// // // //     // 🚀 MASTER METRICS & KPI CALCULATION
// // // //     const metrics = useMemo(() => {
// // // //         let allTimeImpact = 0;
// // // //         let kpiWindowImpact = 0;
// // // //         let validCapacityEvents = 0;
// // // //         let totalCapacityPercentage = 0;

// // // //         const kpiStart = moment(kpiConfig.startDate).startOf('day');
// // // //         const kpiEnd = moment(kpiConfig.endDate).endOf('day');

// // // //         events.forEach(e => {
// // // //             const checkins = e.currentCheckIns || 0;
// // // //             allTimeImpact += checkins;

// // // //             // Check if event falls inside the KPI target date window
// // // //             if (e.date) {
// // // //                 const eventDate = moment(e.date);
// // // //                 if (eventDate.isBetween(kpiStart, kpiEnd, 'day', '[]')) {
// // // //                     kpiWindowImpact += checkins;
// // // //                 }
// // // //             }

// // // //             if (e.maxCapacity && e.maxCapacity > 0) {
// // // //                 const diffDays = getEventDaysCount(e.date, (e as any).endDate);
// // // //                 const dailyCheckins = diffDays > 1 ? Math.round(checkins / diffDays) : checkins;
// // // //                 totalCapacityPercentage += (dailyCheckins / e.maxCapacity);
// // // //                 validCapacityEvents++;
// // // //             }
// // // //         });

// // // //         const kpiTotalProgress = kpiWindowImpact + (Number(kpiConfig.offlineCarryover) || 0);
// // // //         const targetGoal = Number(kpiConfig.targetAmount) || 1; // Prevent div by 0
// // // //         const progressPercent = Math.min(100, Math.round((kpiTotalProgress / targetGoal) * 100));

// // // //         return {
// // // //             allTimeImpact,
// // // //             averageCapacity: validCapacityEvents > 0 ? Math.round((totalCapacityPercentage / validCapacityEvents) * 100) : 0,
// // // //             kpiTotalProgress,
// // // //             progressPercent,
// // // //             targetGoal
// // // //         };
// // // //     }, [events, kpiConfig]);

// // // //     const filteredEvents = events.filter(e =>
// // // //         e.eventName.toLowerCase().includes(searchTerm.toLowerCase()) ||
// // // //         e.location.toLowerCase().includes(searchTerm.toLowerCase()) ||
// // // //         (e.eventType && e.eventType.toLowerCase().includes(searchTerm.toLowerCase()))
// // // //     );

// // // //     const filteredGuests = guests.filter(g =>
// // // //         (g.firstName + ' ' + g.lastName).toLowerCase().includes(searchTerm.toLowerCase()) ||
// // // //         g.email.toLowerCase().includes(searchTerm.toLowerCase())
// // // //     );

// // // //     if (isLoading) {
// // // //         return (
// // // //             <div className="att-loader-wrap">
// // // //                 <Loader message="Loading Ecosystem Data…" />
// // // //             </div>
// // // //         );
// // // //     }

// // // //     return (
// // // //         <div className="att-root animate-fade-in">

// // // //             {showEventModal && createPortal(
// // // //                 <EventBuilderModal
// // // //                     event={selectedEvent}
// // // //                     programmes={programmes}
// // // //                     onClose={() => {
// // // //                         setShowEventModal(false);
// // // //                         setSelectedEvent(null);
// // // //                     }}
// // // //                     onSave={handleSaveEvent}
// // // //                 />,
// // // //                 document.body
// // // //             )}

// // // //             {/* ─── TARGET SETTINGS MODAL ─── */}
// // // //             {showKpiModal && createPortal(
// // // //                 <div className="lfm-overlay" onClick={() => setShowKpiModal(false)} style={{ zIndex: 9999 }}>
// // // //                     <div className="lfm-modal animate-fade-in" onClick={e => e.stopPropagation()} style={{ maxWidth: '450px' }}>
// // // //                         <div className="lfm-header">
// // // //                             <h2 className="lfm-header__title"><Target size={16} /> Configure Impact Target</h2>
// // // //                             <button className="lfm-close-btn" onClick={() => setShowKpiModal(false)}><X size={20} /></button>
// // // //                         </div>
// // // //                         <div className="lfm-body" style={{ padding: '1.5rem', background: '#f8fafc' }}>
// // // //                             <div className="mlab-form-group mb-4">
// // // //                                 <label>Target Name / Title</label>
// // // //                                 <input type="text" className="mlab-input bg-white" value={kpiForm.title} onChange={e => setKpiForm({ ...kpiForm, title: e.target.value })} placeholder="e.g. FY26 Ecosystem Impact" />
// // // //                             </div>
// // // //                             <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
// // // //                                 <div className="mlab-form-group" style={{ flex: 1 }}>
// // // //                                     <label>Start Date</label>
// // // //                                     <input type="date" className="mlab-input bg-white" value={kpiForm.startDate} onChange={e => setKpiForm({ ...kpiForm, startDate: e.target.value })} />
// // // //                                 </div>
// // // //                                 <div className="mlab-form-group" style={{ flex: 1 }}>
// // // //                                     <label>End Date</label>
// // // //                                     <input type="date" className="mlab-input bg-white" value={kpiForm.endDate} onChange={e => setKpiForm({ ...kpiForm, endDate: e.target.value })} />
// // // //                                 </div>
// // // //                             </div>
// // // //                             <div style={{ display: 'flex', gap: '1rem' }}>
// // // //                                 <div className="mlab-form-group" style={{ flex: 1 }}>
// // // //                                     <label>Annual Target Goal</label>
// // // //                                     <input type="number" className="mlab-input bg-white" value={kpiForm.targetAmount} onChange={e => setKpiForm({ ...kpiForm, targetAmount: Number(e.target.value) })} />
// // // //                                 </div>
// // // //                                 <div className="mlab-form-group" style={{ flex: 1 }}>
// // // //                                     <label>Offline / Base Impact</label>
// // // //                                     <input type="number" className="mlab-input bg-white" value={kpiForm.offlineCarryover} onChange={e => setKpiForm({ ...kpiForm, offlineCarryover: Number(e.target.value) })} />
// // // //                                     <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>Manually add missing data (e.g. 788)</span>
// // // //                                 </div>
// // // //                             </div>
// // // //                         </div>
// // // //                         <div className="lfm-footer">
// // // //                             <button className="lfm-btn lfm-btn--ghost" onClick={() => setShowKpiModal(false)}>Cancel</button>
// // // //                             <button className="lfm-btn lfm-btn--primary" onClick={handleSaveKpi}><Save size={14} /> Save Target</button>
// // // //                         </div>
// // // //                     </div>
// // // //                 </div>,
// // // //                 document.body
// // // //             )}

// // // //             {/* ─── HEADER TABS ─── */}
// // // //             <div className="att-tabs" role="tablist">
// // // //                 <button
// // // //                     role="tab"
// // // //                     className={`att-tab${activeTab === 'events' ? ' att-tab--active' : ''}`}
// // // //                     onClick={() => { setActiveTab('events'); setSearchTerm(''); }}
// // // //                 >
// // // //                     <Calendar size={14} /> Ecosystem Events
// // // //                 </button>
// // // //                 <button
// // // //                     role="tab"
// // // //                     className={`att-tab${activeTab === 'guests' ? ' att-tab--active' : ''}`}
// // // //                     onClick={() => { setActiveTab('guests'); setSearchTerm(''); }}
// // // //                 >
// // // //                     <Database size={14} /> Guest CRM Ledger
// // // //                 </button>
// // // //             </div>


// // // //             {/* 🚀 1. NORTH STAR KPI CARD 🚀 */}
// // // //             <div style={{ background: '#0f172a', padding: '1.5rem 2rem', borderRadius: '16px', marginBottom: '1.5rem', color: 'white', position: 'relative', overflow: 'hidden', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)' }}>
// // // //                 {/* Decorative background elements */}
// // // //                 <div style={{ position: 'absolute', right: '-5%', top: '-20%', opacity: 0.1 }}><Target size={180} color="white" /></div>

// // // //                 <div style={{ position: 'relative', zIndex: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
// // // //                     <div style={{ flex: 1 }}>
// // // //                         <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
// // // //                             <div style={{ background: 'rgba(255,255,255,0.1)', padding: '6px 12px', borderRadius: '20px', fontSize: '0.75rem', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
// // // //                                 {moment(kpiConfig.startDate).format('D MMM YYYY')} — {moment(kpiConfig.endDate).format('D MMM YYYY')}
// // // //                             </div>
// // // //                         </div>
// // // //                         <h2 style={{ margin: '0 0 1rem 0', fontSize: '1.5rem', fontWeight: 700, fontFamily: 'var(--font-heading)' }}>
// // // //                             {kpiConfig.title}
// // // //                         </h2>

// // // //                         {/* Progress Bar Area */}
// // // //                         <div style={{ marginBottom: '10px' }}>
// // // //                             <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', alignItems: 'flex-end' }}>
// // // //                                 <div style={{ fontSize: '2.5rem', fontWeight: 800, lineHeight: 1, fontFamily: 'var(--font-heading)', color: '#10b981' }}>
// // // //                                     {metrics.kpiTotalProgress.toLocaleString()} <span style={{ fontSize: '1.25rem', color: '#94a3b8', fontWeight: 600 }}>/ {metrics.targetGoal.toLocaleString()}</span>
// // // //                                 </div>
// // // //                                 <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'white' }}>{metrics.progressPercent}%</div>
// // // //                             </div>

// // // //                             {/* The Bar */}
// // // //                             <div style={{ height: '12px', background: 'rgba(255,255,255,0.1)', borderRadius: '6px', overflow: 'hidden' }}>
// // // //                                 <div style={{
// // // //                                     width: `${metrics.progressPercent}%`,
// // // //                                     height: '100%',
// // // //                                     background: metrics.progressPercent >= 100 ? '#34d399' : '#10b981',
// // // //                                     borderRadius: '6px',
// // // //                                     transition: 'width 1s ease-in-out'
// // // //                                 }} />
// // // //                             </div>
// // // //                         </div>

// // // //                         <p style={{ margin: 0, fontSize: '0.85rem', color: '#94a3b8' }}>
// // // //                             Includes <strong style={{ color: 'white' }}>{kpiConfig.offlineCarryover}</strong> historical base impacts + live event check-ins.
// // // //                         </p>
// // // //                     </div>

// // // //                     {/* Edit Config Button */}
// // // //                     <button
// // // //                         onClick={() => setShowKpiModal(true)}
// // // //                         style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: 'white', padding: '8px 16px', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem', zIndex: 10 }}
// // // //                     >
// // // //                         <Edit3 size={14} /> Adjust Target
// // // //                     </button>
// // // //                 </div>
// // // //             </div>


// // // //             {/* ─── 4-COLUMN STAT CARDS (GLOBAL TOTALS) ─── */}
// // // //             <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>

// // // //                 {/* 1. All Time Impact */}
// // // //                 <div style={{ background: 'white', padding: '1.25rem', borderRadius: '12px', border: '1px solid var(--mlab-border)', borderLeft: '4px solid #8b5cf6', display: 'flex', alignItems: 'center', gap: '1rem', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.02)' }}>
// // // //                     <div style={{ background: '#ede9fe', padding: '12px', borderRadius: '50%' }}><TrendingUp size={24} color="#8b5cf6" /></div>
// // // //                     <div>
// // // //                         <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--mlab-grey)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>All-Time App Impact</p>
// // // //                         <h3 style={{ margin: '4px 0 0', color: '#8b5cf6', fontSize: '1.5rem', fontFamily: 'var(--font-heading)' }}>{metrics.allTimeImpact.toLocaleString()} <span style={{ fontSize: '0.85rem', color: 'var(--mlab-grey)' }}>Scans</span></h3>
// // // //                     </div>
// // // //                 </div>

// // // //                 {/* 2. Total Events */}
// // // //                 <div style={{ background: 'white', padding: '1.25rem', borderRadius: '12px', border: '1px solid var(--mlab-border)', borderLeft: '4px solid var(--mlab-blue)', display: 'flex', alignItems: 'center', gap: '1rem', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.02)' }}>
// // // //                     <div style={{ background: 'var(--mlab-light-blue)', padding: '12px', borderRadius: '50%' }}><Globe size={24} color="var(--mlab-blue)" /></div>
// // // //                     <div>
// // // //                         <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--mlab-grey)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Events</p>
// // // //                         <h3 style={{ margin: '4px 0 0', color: 'var(--mlab-blue)', fontSize: '1.5rem', fontFamily: 'var(--font-heading)' }}>{events.length} <span style={{ fontSize: '0.85rem', color: 'var(--mlab-grey)' }}>Hosted</span></h3>
// // // //                     </div>
// // // //                 </div>

// // // //                 {/* 3. Unique Guests */}
// // // //                 <div style={{ background: 'white', padding: '1.25rem', borderRadius: '12px', border: '1px solid var(--mlab-border)', borderLeft: '4px solid var(--mlab-green)', display: 'flex', alignItems: 'center', gap: '1rem', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.02)' }}>
// // // //                     <div style={{ background: 'var(--mlab-green-bg)', padding: '12px', borderRadius: '50%' }}><Users size={24} color="var(--mlab-green-dark)" /></div>
// // // //                     <div>
// // // //                         <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--mlab-grey)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Unique Guests</p>
// // // //                         <h3 style={{ margin: '4px 0 0', color: 'var(--mlab-green-dark)', fontSize: '1.5rem', fontFamily: 'var(--font-heading)' }}>{guests.length} <span style={{ fontSize: '0.85rem', color: 'var(--mlab-grey)' }}>Profiles</span></h3>
// // // //                     </div>
// // // //                 </div>

// // // //                 {/* 4. Average Capacity */}
// // // //                 <div style={{ background: 'white', padding: '1.25rem', borderRadius: '12px', border: '1px solid var(--mlab-border)', borderLeft: '4px solid #f59e0b', display: 'flex', alignItems: 'center', gap: '1rem', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.02)' }}>
// // // //                     <div style={{ background: '#fef3c7', padding: '12px', borderRadius: '50%' }}><Activity size={24} color="#d97706" /></div>
// // // //                     <div>
// // // //                         <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--mlab-grey)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Average Capacity</p>
// // // //                         <h3 style={{ margin: '4px 0 0', color: '#d97706', fontSize: '1.5rem', fontFamily: 'var(--font-heading)' }}>{metrics.averageCapacity}% <span style={{ fontSize: '0.85rem', color: 'var(--mlab-grey)' }}>Fill Rate</span></h3>
// // // //                     </div>
// // // //                 </div>
// // // //             </div>

// // // //             {/* ─── SEARCH & TOOLBAR ─── */}
// // // //             <div className="mlab-toolbar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.5rem' }}>
// // // //                 <div className="mlab-search" style={{ minWidth: '250px', background: '#f8fafc', border: '1px solid var(--mlab-border)', borderRadius: '8px', padding: '4px 12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
// // // //                     <Search size={18} color="var(--mlab-grey)" />
// // // //                     <input
// // // //                         type="text"
// // // //                         placeholder={activeTab === 'events' ? "Search events or locations..." : "Search guests by name or email..."}
// // // //                         value={searchTerm}
// // // //                         onChange={(e) => setSearchTerm(e.target.value)}
// // // //                         style={{ border: 'none', borderRadius: 0, outline: 'none', height: 30, background: 'transparent', width: '100%' }}
// // // //                     />
// // // //                 </div>

// // // //                 {activeTab === 'events' && (
// // // //                     <button
// // // //                         className="mlab-btn mlab-btn--primary"
// // // //                         onClick={() => {
// // // //                             setSelectedEvent(null);
// // // //                             setShowEventModal(true);
// // // //                         }}
// // // //                     >
// // // //                         <PlusCircle size={16} /> Create New Event
// // // //                     </button>
// // // //                 )}
// // // //             </div>

// // // //             {/* ─── EVENTS TAB CONTENT ─── */}
// // // //             {activeTab === 'events' && (
// // // //                 <div className="mlab-table-wrap">
// // // //                     <table className="mlab-table">
// // // //                         <thead>
// // // //                             <tr>
// // // //                                 <th>Event Name & Date</th>
// // // //                                 <th>Location</th>
// // // //                                 <th>Capacity</th>
// // // //                                 <th>Custom Fields</th>
// // // //                                 <th className="att-th--right">Action</th>
// // // //                             </tr>
// // // //                         </thead>
// // // //                         <tbody>
// // // //                             {filteredEvents.length > 0 ? filteredEvents.map(event => {
// // // //                                 const diffDays = getEventDaysCount(event.date, (event as any).endDate);
// // // //                                 const totalCheckins = event.currentCheckIns || 0;
// // // //                                 const displayCheckins = diffDays > 1 ? Math.round(totalCheckins / diffDays) : totalCheckins;
// // // //                                 const capacityLabel = diffDays > 1 ? 'Avg/Day' : 'Checked In';

// // // //                                 const capacityPercent = event.maxCapacity ? Math.round((displayCheckins / event.maxCapacity) * 100) : 0;
// // // //                                 let badgeBg = '#ecfccb';
// // // //                                 let badgeColor = '#65a30d';
// // // //                                 let badgeBorder = '#d9f99d';

// // // //                                 if (capacityPercent >= 100) {
// // // //                                     badgeBg = '#fee2e2';
// // // //                                     badgeColor = '#dc2626';
// // // //                                     badgeBorder = '#fecaca';
// // // //                                 } else if (capacityPercent >= 80) {
// // // //                                     badgeBg = '#fef3c7';
// // // //                                     badgeColor = '#d97706';
// // // //                                     badgeBorder = '#fde68a';
// // // //                                 }

// // // //                                 return (
// // // //                                     <tr key={event.id}>
// // // //                                         <td>
// // // //                                             <div style={{ fontWeight: 600, color: 'var(--mlab-blue)' }}>{event.eventName}</div>
// // // //                                             {event.eventType && (
// // // //                                                 <div style={{ fontSize: '0.7rem', color: 'var(--mlab-green)', fontWeight: 'bold', textTransform: 'uppercase', marginTop: '2px' }}>
// // // //                                                     {event.eventType}
// // // //                                                 </div>
// // // //                                             )}
// // // //                                             <div style={{ fontSize: '0.75rem', color: 'var(--mlab-grey)', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '4px' }}>
// // // //                                                 <Calendar size={12} color="#94a3b8" />
// // // //                                                 {formatEventDuration(event.date, (event as any).endDate)}
// // // //                                             </div>
// // // //                                         </td>
// // // //                                         <td>
// // // //                                             <div style={{ fontSize: '0.85rem' }}>{event.location.split(',')[0]}</div>
// // // //                                         </td>
// // // //                                         <td>
// // // //                                             <span className="att-badge" style={{ background: badgeBg, color: badgeColor, border: `1px solid ${badgeBorder}` }}>
// // // //                                                 {displayCheckins} / {event.maxCapacity} {capacityLabel}
// // // //                                             </span>
// // // //                                             {diffDays > 1 && (
// // // //                                                 <div style={{ fontSize: '0.65rem', color: 'var(--mlab-grey)', marginTop: '4px', textAlign: 'center', fontWeight: 500 }}>
// // // //                                                     {totalCheckins} Total Scans
// // // //                                                 </div>
// // // //                                             )}
// // // //                                         </td>
// // // //                                         <td>
// // // //                                             <span style={{ fontSize: '0.75rem', color: 'var(--mlab-grey)' }}>
// // // //                                                 {event.guestFormBlueprint?.length || 0} Extra Question(s)
// // // //                                             </span>
// // // //                                         </td>
// // // //                                         <td className="att-td--right">
// // // //                                             <button
// // // //                                                 className="cdp-btn cdp-btn--sky"
// // // //                                                 onClick={() => {
// // // //                                                     setSelectedEvent(event);
// // // //                                                     setShowEventModal(true);
// // // //                                                 }}
// // // //                                                 title="Edit Event"
// // // //                                             >
// // // //                                                 <Settings size={14} />
// // // //                                             </button>

// // // //                                             <button
// // // //                                                 className="cdp-btn cdp-btn--outline"
// // // //                                                 style={{ marginLeft: 8 }}
// // // //                                                 onClick={() => handleDuplicateEvent(event)}
// // // //                                                 title="Duplicate Event"
// // // //                                             >
// // // //                                                 <Copy size={14} />
// // // //                                             </button>

// // // //                                             <button
// // // //                                                 className="cdp-btn cdp-btn--outline"
// // // //                                                 style={{ marginLeft: 8, paddingLeft: 12, paddingRight: 12 }}
// // // //                                                 onClick={() => navigate(`/admin/ecosystem/event/${event.id}`)}
// // // //                                             >
// // // //                                                 <Users size={14} /> Roster
// // // //                                             </button>

// // // //                                             <button
// // // //                                                 className="mlab-btn mlab-btn--sm"
// // // //                                                 style={{ marginLeft: '8px', background: 'var(--mlab-blue)', color: 'white' }}
// // // //                                                 onClick={() => window.open(`/event-kiosk/${event.id}`, '_blank')}
// // // //                                                 title="Open TV Kiosk"
// // // //                                             >
// // // //                                                 <QrCode size={14} />
// // // //                                             </button>
// // // //                                         </td>
// // // //                                     </tr>
// // // //                                 );
// // // //                             }) : (
// // // //                                 <tr>
// // // //                                     <td colSpan={5} style={{ padding: '3rem', textAlign: 'center', color: 'var(--mlab-grey)' }}>
// // // //                                         No events found. Click "Create New Event" to get started.
// // // //                                     </td>
// // // //                                 </tr>
// // // //                             )}
// // // //                         </tbody>
// // // //                     </table>
// // // //                 </div>
// // // //             )}

// // // //             {/* ─── GUESTS TAB CONTENT ─── */}
// // // //             {activeTab === 'guests' && (
// // // //                 <div className="mlab-table-wrap">
// // // //                     <table className="mlab-table">
// // // //                         <thead>
// // // //                             <tr>
// // // //                                 <th>Guest Name</th>
// // // //                                 <th>Email Address</th>
// // // //                                 <th>Mobile</th>
// // // //                                 <th>Status</th>
// // // //                             </tr>
// // // //                         </thead>
// // // //                         <tbody>
// // // //                             {filteredGuests.length > 0 ? filteredGuests.map(guest => (
// // // //                                 <tr key={guest.email}>
// // // //                                     <td><div style={{ fontWeight: 600 }}>{guest.firstName} {guest.lastName}</div></td>
// // // //                                     <td>{guest.email}</td>
// // // //                                     <td>{guest.phone}</td>
// // // //                                     <td>
// // // //                                         <span className="att-badge att-badge--present">
// // // //                                             <CheckCircle size={11} /> Verified CRM Profile
// // // //                                         </span>
// // // //                                     </td>
// // // //                                 </tr>
// // // //                             )) : (
// // // //                                 <tr>
// // // //                                     <td colSpan={4} style={{ padding: '3rem', textAlign: 'center', color: 'var(--mlab-grey)' }}>
// // // //                                         No guests found. Data will populate once visitors start checking in.
// // // //                                     </td>
// // // //                                 </tr>
// // // //                             )}
// // // //                         </tbody>
// // // //                     </table>
// // // //                 </div>
// // // //             )}
// // // //         </div>
// // // //     );
// // // // };


// // // // // // src/components/AdminPortal/EcosystemDashboard/EcosystemDashboard.tsx

// // // // // import React, { useState, useEffect } from 'react';
// // // // // import { createPortal } from 'react-dom';
// // // // // import { doc, collection, setDoc, updateDoc, onSnapshot, query, orderBy } from 'firebase/firestore';
// // // // // import {
// // // // //     Calendar, Users, Search, PlusCircle, QrCode,
// // // // //     Settings, CheckCircle, Globe, Database
// // // // // } from 'lucide-react';
// // // // // import { db } from '../../../lib/firebase';
// // // // // import Loader from '../../../components/common/Loader/Loader';
// // // // // import { useToast } from '../../../components/common/Toast/Toast';
// // // // // import { useStore } from '../../../store/useStore';

// // // // // import { EventBuilderModal } from './EventBuilderModal';

// // // // // import '../../../components/views/LearnersView/LearnersView.css';
// // // // // import "../../../pages/FacilitatorDashboard/AttendanceRegister/AttendanceHistoryList.css";
// // // // // import type { EcosystemEvent } from '../../../types/ecosystem.types';
// // // // // import { useNavigate } from 'react-router-dom';

// // // // // // ─── SMART DATE FORMATTER ───
// // // // // const formatEventDuration = (startIso: string, endIso?: string) => {
// // // // //     if (!startIso) return "Date TBD";
// // // // //     const start = new Date(startIso);
// // // // //     const end = endIso ? new Date(endIso) : start;

// // // // //     // Reset time to accurately count full days
// // // // //     start.setHours(0, 0, 0, 0);
// // // // //     end.setHours(0, 0, 0, 0);

// // // // //     const diffDays = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
// // // // //     const startStr = start.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' });

// // // // //     // 1-Day Event
// // // // //     if (diffDays <= 1) return startStr;

// // // // //     // Multi-Day (Same Month & Year) -> "12 – 14 Oct 2026 (3 Days)"
// // // // //     if (start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear()) {
// // // // //         const monthYear = start.toLocaleDateString('en-ZA', { month: 'short', year: 'numeric' });
// // // // //         return `${start.getDate()} – ${end.getDate()} ${monthYear} (${diffDays} Days)`;
// // // // //     }

// // // // //     // Multi-Day (Different Months/Years) -> "30 Sep 2026 – 2 Oct 2026 (3 Days)"
// // // // //     const endStr = end.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' });
// // // // //     return `${startStr} – ${endStr} (${diffDays} Days)`;
// // // // // };

// // // // // export const EcosystemDashboard: React.FC = () => {
// // // // //     const toast = useToast();
// // // // //     const { programmes, user } = useStore();
// // // // //     const navigate = useNavigate();

// // // // //     // ─── TABS & LOADING STATE ───
// // // // //     const [activeTab, setActiveTab] = useState<'events' | 'guests'>('events');
// // // // //     const [isLoading, setIsLoading] = useState(true);

// // // // //     // ─── MODAL STATES ───
// // // // //     const [showEventModal, setShowEventModal] = useState(false);
// // // // //     const [selectedEvent, setSelectedEvent] = useState<EcosystemEvent | null>(null);

// // // // //     // ─── DATA STATES ───
// // // // //     const [events, setEvents] = useState<EcosystemEvent[]>([]);
// // // // //     const [guests, setGuests] = useState<any[]>([]);
// // // // //     const [searchTerm, setSearchTerm] = useState('');

// // // // //     useEffect(() => {
// // // // //         setIsLoading(true);

// // // // //         // Sync Events
// // // // //         const eventsQuery = query(collection(db, 'events'), orderBy('date', 'desc'));
// // // // //         const unsubscribeEvents = onSnapshot(eventsQuery, (snapshot) => {
// // // // //             const fetchedEvents = snapshot.docs.map(doc => ({
// // // // //                 id: doc.id,
// // // // //                 ...doc.data()
// // // // //             })) as EcosystemEvent[];
// // // // //             setEvents(fetchedEvents);
// // // // //             setIsLoading(false);
// // // // //         }, (error) => {
// // // // //             console.error("Error fetching events:", error);
// // // // //             toast.error("Failed to load ecosystem events.");
// // // // //             setIsLoading(false);
// // // // //         });

// // // // //         // Sync Guests (For Tab 2)
// // // // //         const guestsQuery = query(collection(db, 'ecosystem_guests'), orderBy('lastSeenAt', 'desc'));
// // // // //         const unsubscribeGuests = onSnapshot(guestsQuery, (snapshot) => {
// // // // //             const fetchedGuests = snapshot.docs.map(doc => ({
// // // // //                 email: doc.id,
// // // // //                 ...doc.data()
// // // // //             }));
// // // // //             setGuests(fetchedGuests);
// // // // //         });

// // // // //         return () => {
// // // // //             unsubscribeEvents();
// // // // //             unsubscribeGuests();
// // // // //         };
// // // // //         // eslint-disable-next-line react-hooks/exhaustive-deps
// // // // //     }, []);

// // // // //     // ─── SAVE HANDLER FOR THE EVENT MODAL ───
// // // // //     const handleSaveEvent = async (eventData: Partial<EcosystemEvent>) => {
// // // // //         try {
// // // // //             const isEdit = !!selectedEvent?.id;
// // // // //             const eventRef = isEdit
// // // // //                 ? doc(db, 'events', selectedEvent.id)
// // // // //                 : doc(collection(db, 'events'));

// // // // //             const payload: any = {
// // // // //                 ...eventData,
// // // // //                 updatedAt: new Date().toISOString(),
// // // // //             };

// // // // //             if (isEdit) {
// // // // //                 await updateDoc(eventRef, payload);
// // // // //                 toast.success("Event updated successfully!");
// // // // //             } else {
// // // // //                 payload.id = eventRef.id;
// // // // //                 payload.createdBy = user?.uid || 'admin';
// // // // //                 payload.currentCheckIns = 0;
// // // // //                 payload.status = 'active';
// // // // //                 payload.createdAt = new Date().toISOString();

// // // // //                 await setDoc(eventRef, payload);
// // // // //                 toast.success("Event created successfully!");
// // // // //             }

// // // // //             // Close modal & reset state
// // // // //             setShowEventModal(false);
// // // // //             setSelectedEvent(null);

// // // // //         } catch (error: any) {
// // // // //             console.error("Failed to save event:", error);
// // // // //             throw error;
// // // // //         }
// // // // //     };

// // // // //     const filteredEvents = events.filter(e =>
// // // // //         e.eventName.toLowerCase().includes(searchTerm.toLowerCase()) ||
// // // // //         e.location.toLowerCase().includes(searchTerm.toLowerCase()) ||
// // // // //         (e.eventType && e.eventType.toLowerCase().includes(searchTerm.toLowerCase()))
// // // // //     );

// // // // //     const filteredGuests = guests.filter(g =>
// // // // //         (g.firstName + ' ' + g.lastName).toLowerCase().includes(searchTerm.toLowerCase()) ||
// // // // //         g.email.toLowerCase().includes(searchTerm.toLowerCase())
// // // // //     );

// // // // //     if (isLoading) {
// // // // //         return (
// // // // //             <div className="att-loader-wrap">
// // // // //                 <Loader message="Loading Ecosystem Data…" />
// // // // //             </div>
// // // // //         );
// // // // //     }

// // // // //     return (
// // // // //         <div className="att-root animate-fade-in">

// // // // //             {showEventModal && createPortal(
// // // // //                 <EventBuilderModal
// // // // //                     event={selectedEvent}
// // // // //                     programmes={programmes}
// // // // //                     onClose={() => {
// // // // //                         setShowEventModal(false);
// // // // //                         setSelectedEvent(null);
// // // // //                     }}
// // // // //                     onSave={handleSaveEvent}
// // // // //                 />,
// // // // //                 document.body
// // // // //             )}

// // // // //             {/* ─── HEADER TABS ─── */}
// // // // //             <div className="att-tabs" role="tablist">
// // // // //                 <button
// // // // //                     role="tab"
// // // // //                     className={`att-tab${activeTab === 'events' ? ' att-tab--active' : ''}`}
// // // // //                     onClick={() => { setActiveTab('events'); setSearchTerm(''); }}
// // // // //                 >
// // // // //                     <Calendar size={14} /> Ecosystem Events
// // // // //                 </button>
// // // // //                 <button
// // // // //                     role="tab"
// // // // //                     className={`att-tab${activeTab === 'guests' ? ' att-tab--active' : ''}`}
// // // // //                     onClick={() => { setActiveTab('guests'); setSearchTerm(''); }}
// // // // //                 >
// // // // //                     <Database size={14} /> Guest CRM Ledger
// // // // //                 </button>
// // // // //             </div>

// // // // //             {/* ─── STAT CARDS ─── */}
// // // // //             <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
// // // // //                 <div style={{ background: 'white', padding: '1.25rem', borderRadius: '12px', border: '1px solid var(--mlab-border)', borderLeft: '4px solid var(--mlab-blue)', display: 'flex', alignItems: 'center', gap: '1rem' }}>
// // // // //                     <div style={{ background: 'var(--mlab-light-blue)', padding: '12px', borderRadius: '50%' }}><Globe size={24} color="var(--mlab-blue)" /></div>
// // // // //                     <div>
// // // // //                         <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--mlab-grey)', fontWeight: 700, textTransform: 'uppercase' }}>Total Events</p>
// // // // //                         <h3 style={{ margin: '4px 0 0', color: 'var(--mlab-blue)', fontSize: '1.5rem' }}>{events.length} <span style={{ fontSize: '1rem', color: 'var(--mlab-grey)' }}>Hosted</span></h3>
// // // // //                     </div>
// // // // //                 </div>

// // // // //                 <div style={{ background: 'white', padding: '1.25rem', borderRadius: '12px', border: '1px solid var(--mlab-border)', borderLeft: '4px solid var(--mlab-green)', display: 'flex', alignItems: 'center', gap: '1rem' }}>
// // // // //                     <div style={{ background: 'var(--mlab-green-bg)', padding: '12px', borderRadius: '50%' }}><Users size={24} color="var(--mlab-green-dark)" /></div>
// // // // //                     <div>
// // // // //                         <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--mlab-grey)', fontWeight: 700, textTransform: 'uppercase' }}>Total Unique Guests</p>
// // // // //                         <h3 style={{ margin: '4px 0 0', color: 'var(--mlab-green-dark)', fontSize: '1.5rem' }}>{guests.length}</h3>
// // // // //                     </div>
// // // // //                 </div>
// // // // //             </div>

// // // // //             {/* ─── SEARCH & TOOLBAR ─── */}
// // // // //             <div className="mlab-toolbar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.5rem' }}>
// // // // //                 <div className="mlab-search" style={{ minWidth: '250px', background: '#f8fafc', border: '1px solid var(--mlab-border)', borderRadius: '8px', padding: '4px 12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
// // // // //                     <Search size={18} color="var(--mlab-grey)" />
// // // // //                     <input
// // // // //                         type="text"
// // // // //                         placeholder={activeTab === 'events' ? "Search events or locations..." : "Search guests by name or email..."}
// // // // //                         value={searchTerm}
// // // // //                         onChange={(e) => setSearchTerm(e.target.value)}
// // // // //                         style={{ border: 'none', outline: 'none', background: 'transparent', width: '100%' }}
// // // // //                     />
// // // // //                 </div>

// // // // //                 {activeTab === 'events' && (
// // // // //                     <button
// // // // //                         className="mlab-btn mlab-btn--primary"
// // // // //                         onClick={() => {
// // // // //                             setSelectedEvent(null);
// // // // //                             setShowEventModal(true);
// // // // //                         }}
// // // // //                     >
// // // // //                         <PlusCircle size={16} /> Create New Event
// // // // //                     </button>
// // // // //                 )}
// // // // //             </div>

// // // // //             {/* ─── EVENTS TAB CONTENT ─── */}
// // // // //             {activeTab === 'events' && (
// // // // //                 <div className="mlab-table-wrap">
// // // // //                     <table className="mlab-table">
// // // // //                         <thead>
// // // // //                             <tr>
// // // // //                                 <th>Event Name & Date</th>
// // // // //                                 <th>Location</th>
// // // // //                                 <th>Capacity</th>
// // // // //                                 <th>Custom Fields</th>
// // // // //                                 <th className="att-th--right">Action</th>
// // // // //                             </tr>
// // // // //                         </thead>
// // // // //                         <tbody>
// // // // //                             {filteredEvents.length > 0 ? filteredEvents.map(event => (
// // // // //                                 <tr key={event.id}>
// // // // //                                     <td>
// // // // //                                         <div style={{ fontWeight: 600, color: 'var(--mlab-blue)' }}>{event.eventName}</div>
// // // // //                                         {event.eventType && (
// // // // //                                             <div style={{ fontSize: '0.7rem', color: 'var(--mlab-green)', fontWeight: 'bold', textTransform: 'uppercase', marginTop: '2px' }}>
// // // // //                                                 {event.eventType}
// // // // //                                             </div>
// // // // //                                         )}
// // // // //                                         <div style={{ fontSize: '0.75rem', color: 'var(--mlab-grey)', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '4px' }}>
// // // // //                                             <Calendar size={12} color="#94a3b8" />
// // // // //                                             {formatEventDuration(event.date, (event as any).endDate)}
// // // // //                                         </div>
// // // // //                                     </td>
// // // // //                                     <td>
// // // // //                                         <div style={{ fontSize: '0.85rem' }}>{event.location.split(',')[0]}</div>
// // // // //                                     </td>
// // // // //                                     <td>
// // // // //                                         <span className="att-badge" style={{ background: '#fef3c7', color: '#d97706', border: '1px solid #fde68a' }}>
// // // // //                                             {event.currentCheckIns || 0} / {event.maxCapacity} Checked In
// // // // //                                         </span>
// // // // //                                     </td>
// // // // //                                     <td>
// // // // //                                         <span style={{ fontSize: '0.75rem', color: 'var(--mlab-grey)' }}>
// // // // //                                             {event.guestFormBlueprint?.length || 0} Extra Question(s)
// // // // //                                         </span>
// // // // //                                     </td>
// // // // //                                     <td className="att-td--right">
// // // // //                                         <button
// // // // //                                             className="cdp-btn cdp-btn--sky"
// // // // //                                             onClick={() => {
// // // // //                                                 // setSelectedEvent(event);
// // // // //                                                 // setShowEventModal(true);
// // // // //                                                 setSelectedEvent(event);
// // // // //                                                 setShowEventModal(true);
// // // // //                                             }}
// // // // //                                         >
// // // // //                                             <Settings size={14} /> Manage
// // // // //                                         </button>
// // // // //                                         <button
// // // // //                                             className="cdp-btn cdp-btn--outline"
// // // // //                                             style={{ marginLeft: 8, }}
// // // // //                                             onClick={() => navigate(`/admin/ecosystem/event/${event.id}`)}
// // // // //                                         >
// // // // //                                             <Users size={14} /> View Roster
// // // // //                                         </button>

// // // // //                                         <button
// // // // //                                             className="mlab-btn mlab-btn--sm"
// // // // //                                             style={{ marginLeft: '8px', background: 'var(--mlab-blue)', color: 'white' }}
// // // // //                                             onClick={() => window.open(`/event-kiosk/${event.id}`, '_blank')}
// // // // //                                         >
// // // // //                                             <QrCode size={14} /> View Door QR
// // // // //                                         </button>
// // // // //                                     </td>
// // // // //                                 </tr>
// // // // //                             )) : (
// // // // //                                 <tr>
// // // // //                                     <td colSpan={5} style={{ padding: '3rem', textAlign: 'center', color: 'var(--mlab-grey)' }}>
// // // // //                                         No events found. Click "Create New Event" to get started.
// // // // //                                     </td>
// // // // //                                 </tr>
// // // // //                             )}
// // // // //                         </tbody>
// // // // //                     </table>
// // // // //                 </div>
// // // // //             )}

// // // // //             {/* ─── GUESTS TAB CONTENT ─── */}
// // // // //             {activeTab === 'guests' && (
// // // // //                 <div className="mlab-table-wrap">
// // // // //                     <table className="mlab-table">
// // // // //                         <thead>
// // // // //                             <tr>
// // // // //                                 <th>Guest Name</th>
// // // // //                                 <th>Email Address</th>
// // // // //                                 <th>Mobile</th>
// // // // //                                 <th>Status</th>
// // // // //                             </tr>
// // // // //                         </thead>
// // // // //                         <tbody>
// // // // //                             {filteredGuests.length > 0 ? filteredGuests.map(guest => (
// // // // //                                 <tr key={guest.email}>
// // // // //                                     <td><div style={{ fontWeight: 600 }}>{guest.firstName} {guest.lastName}</div></td>
// // // // //                                     <td>{guest.email}</td>
// // // // //                                     <td>{guest.phone}</td>
// // // // //                                     <td>
// // // // //                                         <span className="att-badge att-badge--present">
// // // // //                                             <CheckCircle size={11} /> Verified CRM Profile
// // // // //                                         </span>
// // // // //                                     </td>
// // // // //                                 </tr>
// // // // //                             )) : (
// // // // //                                 <tr>
// // // // //                                     <td colSpan={4} style={{ padding: '3rem', textAlign: 'center', color: 'var(--mlab-grey)' }}>
// // // // //                                         No guests found. Data will populate once visitors start checking in.
// // // // //                                     </td>
// // // // //                                 </tr>
// // // // //                             )}
// // // // //                         </tbody>
// // // // //                     </table>
// // // // //                 </div>
// // // // //             )}
// // // // //         </div>
// // // // //     );
// // // // // };