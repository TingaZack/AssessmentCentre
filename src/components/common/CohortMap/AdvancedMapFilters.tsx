// src/components/common/CohortMap/AdvancedMapFilters.tsx

import React, { useMemo, useState } from 'react';
import { X, SlidersHorizontal, MapPin, Users, Award, Activity, RefreshCw, ClipboardList, ChevronRight, ChevronDown, CheckCircle2 } from 'lucide-react';

export interface AdvancedMapFilterState {
    genders: string[];
    equityGroups: string[];
    performance: string[];
    minAge: number;
    maxAge: number;
    geoLevels: string[];
    surveyId?: string;
    surveyStatus?: 'all' | 'completed' | 'pending';
    surveyQuestionId?: string;
    surveyAnswerValues?: string[];
}

interface Props {
    filters: AdvancedMapFilterState;
    setFilters: React.Dispatch<React.SetStateAction<AdvancedMapFilterState>>;
    activeFemaleCount: number;
    activeMaleCount: number;
    totalActive: number;
    availableSurveys?: any[];
    cohortSurveyResponses?: any[];
    filteredCount: number;
    locationCount: number;
    geoTree?: Record<string, any>; // Made optional to prevent strict typing errors
    selectedLocation: string | null;
    onSelectLocation: (loc: string | null) => void;
    onClose: () => void;
}

const EQUITY_OPTIONS = [
    { label: 'Black African', value: 'BA' },
    { label: 'Coloured', value: 'BC' },
    { label: 'Indian / Asian', value: 'BI' },
    { label: 'White', value: 'Wh' },
    { label: 'Other', value: 'Oth' }
];

const GEO_LEVEL_OPTIONS = [
    { label: 'Provinces', value: 'province' },
    { label: 'Districts & Metros', value: 'district' },
    { label: 'Local Municipalities', value: 'municipality' },
    { label: 'Cities & Towns', value: 'city' }
];

export const AdvancedMapFilters: React.FC<Props> = ({
    filters, setFilters, activeFemaleCount, activeMaleCount, totalActive, availableSurveys = [], cohortSurveyResponses = [], filteredCount, locationCount,
    geoTree = {}, // 🚀 FIXED: Added default empty object fallback
    selectedLocation, onSelectLocation, onClose
}) => {

    const [expandedProvs, setExpandedProvs] = useState<Set<string>>(new Set());
    const [expandedDists, setExpandedDists] = useState<Set<string>>(new Set());

    const toggleProv = (prov: string) => {
        setExpandedProvs(prev => { const next = new Set(prev); next.has(prov) ? next.delete(prov) : next.add(prov); return next; });
    };

    const toggleDist = (dist: string) => {
        setExpandedDists(prev => { const next = new Set(prev); next.has(dist) ? next.delete(dist) : next.add(dist); return next; });
    };

    const toggleArrayValue = (key: keyof AdvancedMapFilterState, value: string) => {
        setFilters(prev => {
            const currentArray = (prev[key] as string[]) || [];
            const newArray = currentArray.includes(value)
                ? currentArray.filter(v => v !== value)
                : [...currentArray, value];
            return { ...prev, [key]: newArray };
        });
    };

    const femalePct = totalActive > 0 ? Math.round((activeFemaleCount / totalActive) * 100) : 0;
    const malePct = totalActive > 0 ? Math.round((activeMaleCount / totalActive) * 100) : 0;

    const selectedSurvey = availableSurveys.find(s => s.id === filters.surveyId);
    const filterableQuestions = selectedSurvey?.questions?.filter((q: any) => q.type === 'single_choice' || q.type === 'rating') || [];
    const selectedQuestion = filterableQuestions.find((q: any) => q.id === filters.surveyQuestionId);

    const { answerCounts, dynamicOptions } = useMemo(() => {
        const counts: Record<string, number> = {};
        const optionsSet = new Set<string>();

        if (!selectedQuestion || !filters.surveyId) return { answerCounts: counts, dynamicOptions: [] };

        const relevantResponses = cohortSurveyResponses.filter(r => r.surveyId === filters.surveyId);

        if (selectedQuestion.type === 'single_choice' && Array.isArray(selectedQuestion.options)) {
            selectedQuestion.options.forEach((opt: string) => {
                const strOpt = String(opt).trim();
                if (strOpt) optionsSet.add(strOpt);
            });
        } else if (selectedQuestion.type === 'rating') {
            Array.from({ length: selectedQuestion.maxStars || 5 }, (_, i) => String(i + 1)).forEach(opt => optionsSet.add(opt));
        }

        relevantResponses.forEach(r => {
            const rawVal = r.answers?.[selectedQuestion.id];
            if (rawVal !== undefined && rawVal !== null && rawVal !== '') {
                if (Array.isArray(rawVal)) {
                    rawVal.forEach(val => {
                        const strVal = String(val).trim();
                        counts[strVal] = (counts[strVal] || 0) + 1;
                        optionsSet.add(strVal);
                    });
                } else {
                    const strVal = String(rawVal).trim();
                    counts[strVal] = (counts[strVal] || 0) + 1;
                    optionsSet.add(strVal);
                }
            }
        });

        return { answerCounts: counts, dynamicOptions: Array.from(optionsSet).sort() };
    }, [cohortSurveyResponses, filters.surveyId, selectedQuestion]);

    return (
        <div style={{
            width: '340px',
            height: '100%',
            background: 'var(--mlab-white)',
            borderRight: '2px solid var(--mlab-blue)',
            display: 'flex',
            flexDirection: 'column',
            flexShrink: 0,
            zIndex: 10
        }}>
            <div className="lfm-header" style={{ padding: '1.1rem 1.5rem', height: 75 }}>
                <h2 className="lfm-header__title">
                    <SlidersHorizontal size={16} /> Impact Filters
                </h2>
                <button className="lfm-close-btn" type="button" onClick={onClose} title="Close Filters">
                    <X size={20} />
                </button>
            </div>

            <div style={{ padding: '1rem 1.5rem', background: 'var(--mlab-light-blue)', borderBottom: '1px solid var(--mlab-border)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: '0.85rem', color: 'var(--mlab-blue)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        Matching Learners
                    </span>
                    <span style={{ background: 'var(--mlab-blue)', color: 'white', padding: '2px 10px', borderRadius: '12px', fontSize: '0.8rem', fontWeight: 'bold' }}>
                        {filteredCount || 0}
                    </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: '0.85rem', color: 'var(--mlab-green-dark)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        Map Locations
                    </span>
                    <span style={{ background: 'var(--mlab-green)', color: 'var(--mlab-blue)', padding: '2px 10px', borderRadius: '12px', fontSize: '0.8rem', fontWeight: 'bold' }}>
                        {locationCount || 0}
                    </span>
                </div>
            </div>

            <div className="lfm-body" style={{ padding: '1.5rem', gap: '1.75rem', overflowY: 'auto' }}>

                {/* 🚀 FIXED: Safe Geographic Drill-down Rendering */}
                <div>
                    <div className="lfm-section-hdr"><MapPin size={13} /> Geographic Drill-down</div>
                    <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.75rem', color: 'var(--mlab-grey)', margin: '0 0 12px 0' }}>
                        Select a specific region to isolate map markers. Counts represent learners matching current demographic filters.
                    </p>

                    <div style={{ border: '1px solid var(--mlab-border)', borderRadius: '4px', overflow: 'hidden' }}>
                        <div
                            onClick={() => onSelectLocation(null)}
                            style={{ padding: '10px 12px', background: !selectedLocation ? 'var(--mlab-light-blue)' : 'var(--mlab-bg)', borderBottom: '1px solid var(--mlab-border)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
                        >
                            <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--mlab-blue)' }}>🌍 All Regions</span>
                        </div>

                        {/* Safely fallback to Object.keys(geoTree || {}) */}
                        {Object.keys(geoTree || {}).sort().map(prov => {
                            const isProvExpanded = expandedProvs.has(prov);
                            const isProvSelected = selectedLocation === prov;

                            return (
                                <div key={prov}>
                                    <div style={{ padding: '8px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--mlab-border)', background: isProvSelected ? '#e0f2fe' : '#fff', cursor: 'pointer' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: 1 }} onClick={() => toggleProv(prov)}>
                                            {isProvExpanded ? <ChevronDown size={14} color="var(--mlab-grey)" /> : <ChevronRight size={14} color="var(--mlab-grey)" />}
                                            <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--mlab-midnight)' }}>{prov}</span>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <span style={{ fontSize: '0.7rem', color: 'var(--mlab-grey)', fontWeight: 600 }}>{geoTree[prov]?.count || 0}</span>
                                            <input type="radio" checked={isProvSelected} onChange={() => onSelectLocation(prov)} style={{ accentColor: 'var(--mlab-green)', cursor: 'pointer' }} />
                                        </div>
                                    </div>

                                    {isProvExpanded && (
                                        <div style={{ background: '#f8fafc' }}>
                                            {Object.keys(geoTree[prov]?.districts || {}).sort().map(dist => {
                                                const isDistExpanded = expandedDists.has(dist);
                                                const isDistSelected = selectedLocation === dist;

                                                return (
                                                    <div key={dist}>
                                                        <div style={{ padding: '6px 12px 6px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--mlab-border)', background: isDistSelected ? '#e0f2fe' : 'transparent', cursor: 'pointer' }}>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: 1 }} onClick={() => toggleDist(dist)}>
                                                                {isDistExpanded ? <ChevronDown size={12} color="var(--mlab-grey)" /> : <ChevronRight size={12} color="var(--mlab-grey)" />}
                                                                <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--mlab-blue)' }}>{dist}</span>
                                                            </div>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                                <span style={{ fontSize: '0.7rem', color: 'var(--mlab-grey)' }}>{geoTree[prov].districts[dist]?.count || 0}</span>
                                                                <input type="radio" checked={isDistSelected} onChange={() => onSelectLocation(dist)} style={{ accentColor: 'var(--mlab-green)', cursor: 'pointer' }} />
                                                            </div>
                                                        </div>

                                                        {isDistExpanded && (
                                                            <div style={{ background: '#f1f5f9' }}>
                                                                {Object.keys(geoTree[prov]?.districts?.[dist]?.municipalities || {}).sort().map(muni => {
                                                                    const count = geoTree[prov].districts[dist].municipalities[muni] || 0;
                                                                    const isMuniSelected = selectedLocation === muni;

                                                                    return (
                                                                        <div key={muni} onClick={() => onSelectLocation(muni)} style={{ padding: '6px 12px 6px 52px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #e2e8f0', background: isMuniSelected ? '#e0f2fe' : 'transparent', cursor: 'pointer' }} onMouseOver={e => e.currentTarget.style.background = isMuniSelected ? '#e0f2fe' : '#e2e8f0'} onMouseOut={e => e.currentTarget.style.background = isMuniSelected ? '#e0f2fe' : 'transparent'}>
                                                                            <span style={{ fontSize: '0.75rem', color: '#475569' }}>{muni}</span>
                                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                                                <span style={{ fontSize: '0.7rem', color: 'var(--mlab-grey)' }}>{count}</span>
                                                                                <input type="radio" checked={isMuniSelected} readOnly style={{ accentColor: 'var(--mlab-green)', cursor: 'pointer' }} />
                                                                            </div>
                                                                        </div>
                                                                    );
                                                                })}
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>

                <div>
                    <div className="lfm-section-hdr"><Users size={13} /> Gender Parity</div>
                    <div style={{ display: 'flex', gap: '10px' }}>
                        <button onClick={() => toggleArrayValue('genders', 'F')} style={{ flex: 1, padding: '12px', borderRadius: '0', border: `1px solid ${filters.genders.includes('F') ? '#ec4899' : 'var(--mlab-border)'}`, background: filters.genders.includes('F') ? '#fdf2f8' : 'var(--mlab-white)', cursor: 'pointer', textAlign: 'left', transition: 'all 0.2s ease' }}>
                            <div style={{ fontFamily: 'var(--font-heading)', textTransform: 'uppercase', letterSpacing: '0.05em', fontSize: '0.7rem', color: '#64748b', fontWeight: 700 }}>Female</div>
                            <div style={{ fontFamily: 'var(--font-heading)', fontSize: '1.5rem', fontWeight: 700, color: '#ec4899', lineHeight: 1.2 }}>{activeFemaleCount}</div>
                            <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.65rem', color: '#64748b' }}>{femalePct}% of active</div>
                        </button>
                        <button onClick={() => toggleArrayValue('genders', 'M')} style={{ flex: 1, padding: '12px', borderRadius: '0', border: `1px solid ${filters.genders.includes('M') ? '#3b82f6' : 'var(--mlab-border)'}`, background: filters.genders.includes('M') ? '#eff6ff' : 'var(--mlab-white)', cursor: 'pointer', textAlign: 'left', transition: 'all 0.2s ease' }}>
                            <div style={{ fontFamily: 'var(--font-heading)', textTransform: 'uppercase', letterSpacing: '0.05em', fontSize: '0.7rem', color: '#64748b', fontWeight: 700 }}>Male</div>
                            <div style={{ fontFamily: 'var(--font-heading)', fontSize: '1.5rem', fontWeight: 700, color: '#3b82f6', lineHeight: 1.2 }}>{activeMaleCount}</div>
                            <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.65rem', color: '#64748b' }}>{malePct}% of active</div>
                        </button>
                    </div>
                </div>

                <div>
                    <div className="lfm-section-hdr"><Activity size={13} /> Age Bracket</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <input type="number" className="lfm-input" min={16} max={filters.maxAge} value={filters.minAge} onChange={e => setFilters(prev => ({ ...prev, minAge: Math.max(16, Number(e.target.value)) }))} style={{ width: '60px', padding: '6px', textAlign: 'center' }} />
                        <input type="range" min={16} max={65} value={filters.minAge} onChange={e => setFilters(prev => ({ ...prev, minAge: Number(e.target.value) }))} style={{ flex: 1, accentColor: 'var(--mlab-green)' }} />
                        <input type="range" min={16} max={65} value={filters.maxAge} onChange={e => setFilters(prev => ({ ...prev, maxAge: Number(e.target.value) }))} style={{ flex: 1, accentColor: 'var(--mlab-green)' }} />
                        <input type="number" className="lfm-input" min={filters.minAge} max={99} value={filters.maxAge} onChange={e => setFilters(prev => ({ ...prev, maxAge: Math.min(99, Number(e.target.value)) }))} style={{ width: '60px', padding: '6px', textAlign: 'center' }} />
                    </div>
                </div>

                <div>
                    <div className="lfm-section-hdr"><Award size={13} /> Equity Designation</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                        {EQUITY_OPTIONS.map(opt => (
                            <button key={opt.value} onClick={() => toggleArrayValue('equityGroups', opt.value)} style={{ padding: '6px 12px', fontFamily: 'var(--font-heading)', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', cursor: 'pointer', borderRadius: '0', border: `1px solid ${filters.equityGroups.includes(opt.value) ? 'var(--mlab-blue)' : 'var(--mlab-border)'}`, background: filters.equityGroups.includes(opt.value) ? 'var(--mlab-light-blue)' : 'var(--mlab-white)', color: filters.equityGroups.includes(opt.value) ? 'var(--mlab-blue)' : 'var(--mlab-grey)', transition: 'all 0.2s ease' }}>
                                {opt.label}
                            </button>
                        ))}
                    </div>
                </div>

                <div>
                    <div className="lfm-section-hdr"><MapPin size={13} /> Map Granularity (Clustering)</div>
                    <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.75rem', color: 'var(--mlab-grey)', margin: '0 0 4px 0' }}>
                        Select how to visually group the map pins.
                    </p>
                    <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.65rem', color: '#0ea5e9', margin: '0 0 12px 0', fontStyle: 'italic' }}>
                        * Changing these does not filter out learners, it only groups them into larger or smaller geographic bubbles.
                    </p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {GEO_LEVEL_OPTIONS.map(opt => (
                            <label key={opt.value} className="lfm-checkbox-row">
                                <input type="checkbox" checked={filters.geoLevels.includes(opt.value)} onChange={() => toggleArrayValue('geoLevels', opt.value)} />
                                {opt.label}
                            </label>
                        ))}
                    </div>
                </div>

                {availableSurveys && availableSurveys.length > 0 && (
                    <div>
                        <div className="lfm-section-hdr"><ClipboardList size={13} /> Survey Analytics</div>
                        <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.75rem', color: 'var(--mlab-grey)', margin: '0 0 12px 0' }}>
                            Filter the map to only show learners who have (or haven't) completed specific surveys.
                        </p>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            <select className="lfm-input lfm-select" value={filters.surveyId || ''} onChange={e => setFilters(prev => ({ ...prev, surveyId: e.target.value, surveyStatus: e.target.value ? 'completed' : 'all', surveyQuestionId: '', surveyAnswerValues: [] }))} style={{ borderRadius: 0 }}>
                                <option value="">-- Ignore Surveys --</option>
                                {availableSurveys.map(s => <option key={s.id} value={s.id}>{s.title}</option>)}
                            </select>

                            {filters.surveyId && (
                                <div style={{ display: 'flex', gap: '4px', marginTop: '4px' }}>
                                    <button onClick={() => setFilters(prev => ({ ...prev, surveyStatus: 'all', surveyQuestionId: '', surveyAnswerValues: [] }))} style={{ flex: 1, padding: '6px', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', background: filters.surveyStatus === 'all' || !filters.surveyStatus ? 'var(--mlab-blue)' : 'var(--mlab-bg)', color: filters.surveyStatus === 'all' || !filters.surveyStatus ? 'white' : 'var(--mlab-grey)', border: '1px solid var(--mlab-border)', cursor: 'pointer' }}>All Status</button>
                                    <button onClick={() => setFilters(prev => ({ ...prev, surveyStatus: 'completed' }))} style={{ flex: 1, padding: '6px', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', background: filters.surveyStatus === 'completed' ? 'var(--mlab-green)' : 'var(--mlab-bg)', color: filters.surveyStatus === 'completed' ? 'var(--mlab-blue)' : 'var(--mlab-grey)', border: '1px solid var(--mlab-border)', cursor: 'pointer' }}>Completed</button>
                                    <button onClick={() => setFilters(prev => ({ ...prev, surveyStatus: 'pending', surveyQuestionId: '', surveyAnswerValues: [] }))} style={{ flex: 1, padding: '6px', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', background: filters.surveyStatus === 'pending' ? 'var(--mlab-red)' : 'var(--mlab-bg)', color: filters.surveyStatus === 'pending' ? 'white' : 'var(--mlab-grey)', border: '1px solid var(--mlab-border)', cursor: 'pointer' }}>Pending</button>
                                </div>
                            )}

                            {filters.surveyId && filters.surveyStatus !== 'pending' && filterableQuestions.length > 0 && (
                                <div className="animate-fade-in" style={{ marginTop: '12px', padding: '12px', background: '#f8fafc', border: '1px dashed var(--mlab-blue)' }}>
                                    <label style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--mlab-blue)', marginBottom: '8px', display: 'block' }}>Drill-down by Answer Value</label>
                                    <select className="lfm-input lfm-select" value={filters.surveyQuestionId || ''} onChange={e => setFilters(prev => ({ ...prev, surveyQuestionId: e.target.value, surveyAnswerValues: [] }))} style={{ width: '100%', borderRadius: 0, fontSize: '0.75rem', padding: '8px', marginBottom: '8px' }}>
                                        <option value="">-- Select a Question to Map --</option>
                                        {filterableQuestions.map((q: any) => <option key={q.id} value={q.id}>{q.label}</option>)}
                                    </select>

                                    {selectedQuestion && (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '150px', overflowY: 'auto' }}>
                                            {dynamicOptions.map((opt: string) => {
                                                const countForOpt = answerCounts[opt] || 0;
                                                return (
                                                    <label key={opt} className="lfm-checkbox-row" style={{ fontSize: '0.75rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                            <input type="checkbox" checked={filters.surveyAnswerValues?.includes(opt) || false} onChange={(e) => { setFilters(prev => { const curr = prev.surveyAnswerValues || []; const next = e.target.checked ? [...curr, opt] : curr.filter(v => v !== opt); return { ...prev, surveyAnswerValues: next }; }); }} />
                                                            <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '180px' }}>{selectedQuestion.type === 'rating' ? `${opt} Stars` : opt}</span>
                                                        </div>
                                                        <span style={{ fontSize: '0.65rem', background: countForOpt > 0 ? 'var(--mlab-light-blue)' : '#f1f5f9', color: countForOpt > 0 ? 'var(--mlab-blue)' : '#64748b', padding: '2px 6px', borderRadius: '4px', fontWeight: 'bold' }}>{countForOpt}</span>
                                                    </label>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            )}

                        </div>
                    </div>
                )}
            </div>

            <div className="lfm-footer" style={{ justifyContent: 'center' }}>
                <button onClick={() => {
                    setFilters({ genders: [], equityGroups: [], performance: [], minAge: 16, maxAge: 65, geoLevels: ['province', 'district', 'municipality', 'city'], surveyId: '', surveyStatus: 'all', surveyQuestionId: '', surveyAnswerValues: [] });
                    onSelectLocation(null);
                }} className="lfm-btn lfm-btn--ghost" style={{ width: '100%', justifyContent: 'center' }}><RefreshCw size={14} /> Reset Filters</button>
            </div>
        </div>
    );
};
