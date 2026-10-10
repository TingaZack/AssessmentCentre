// src/pages/AdminDashboard/ContentAuthoring/LessonAnalytics/LearnerTable.tsx
import React from 'react';
import { ArrowDown, ArrowUp, ChevronRight, HelpCircle, Loader2, MessageSquare, SearchX } from 'lucide-react';
import Tooltip from '../../../../components/common/Tooltip/Tooltip';
import type { LearnerRow } from './types';
import { JOURNEY_LEGEND, JourneyStepper } from './JourneyStepper';
import { fmtDate, RISK_HELP, RISK_LABEL } from './utils';
export type SortKey = 'risk' | 'name' | 'watch' | 'score' | 'activity';
export interface SortState { key: SortKey; dir: 'asc' | 'desc' }

import './LessonAnalytics.css';


interface Props {
    rows: LearnerRow[];
    loading: boolean;
    showCohort: boolean;
    selectedIds: Set<string>;
    activeId: string | null;
    sort: SortState;
    onSort: (key: SortKey) => void;
    onToggleSelect: (id: string) => void;
    onToggleAll: (checked: boolean) => void;
    onOpen: (id: string) => void;
}

const SortHeader: React.FC<{ label: string; k: SortKey; sort: SortState; onSort: (k: SortKey) => void }> = ({ label, k, sort, onSort }) => {
    const active = sort.key === k;
    return (
        <th aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
            <button type="button" className="la-th-btn" onClick={() => onSort(k)}>
                {label}
                {active && (sort.dir === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
            </button>
        </th>
    );
};

export const LearnerTable: React.FC<Props> = ({
    rows, loading, showCohort, selectedIds, activeId, sort, onSort, onToggleSelect, onToggleAll, onOpen
}) => {
    const allChecked = rows.length > 0 && rows.every(r => selectedIds.has(r.learnerId));

    return (
        <div className="la-table-wrap">
            <table className="la-table">
                <thead>
                    <tr>
                        <th className="la-col-check">
                            <input
                                type="checkbox"
                                aria-label="Select all visible learners"
                                checked={allChecked}
                                onChange={e => onToggleAll(e.target.checked)}
                            />
                        </th>
                        <SortHeader label="Learner" k="name" sort={sort} onSort={onSort} />
                        <th>
                            Journey
                            <span className="la-th-sub">{JOURNEY_LEGEND}</span>
                        </th>
                        <SortHeader label="Watched" k="watch" sort={sort} onSort={onSort} />
                        <SortHeader label="Quiz" k="score" sort={sort} onSort={onSort} />
                        <SortHeader label="Discussion" k="activity" sort={sort} onSort={onSort} />
                        <th>
                            <span className="la-th-inline">
                                <button type="button" className="la-th-btn" onClick={() => onSort('risk')}>
                                    Status
                                    {sort.key === 'risk' && (sort.dir === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
                                </button>
                                <Tooltip content={RISK_HELP} placement="top">
                                    <span className="la-help" aria-label="How risk is calculated"><HelpCircle size={13} /></span>
                                </Tooltip>
                            </span>
                        </th>
                        <th className="la-col-go" aria-hidden />
                    </tr>
                </thead>
                <tbody>
                    {loading ? (
                        <tr>
                            <td colSpan={8}>
                                <div className="la-empty"><Loader2 size={22} className="la-spin" /> Loading learner progress…</div>
                            </td>
                        </tr>
                    ) : rows.length === 0 ? (
                        <tr>
                            <td colSpan={8}>
                                <div className="la-empty">
                                    <SearchX size={22} />
                                    No learners match these filters. Clear the filter or search to see everyone.
                                </div>
                            </td>
                        </tr>
                    ) : (
                        rows.map(r => (
                            <tr
                                key={r.learnerId}
                                className={`la-row ${activeId === r.learnerId ? 'is-active' : ''}`}
                                tabIndex={0}
                                onClick={() => onOpen(r.learnerId)}
                                onKeyDown={e => { if (e.key === 'Enter') onOpen(r.learnerId); }}
                            >
                                <td className="la-col-check" onClick={e => e.stopPropagation()}>
                                    <input
                                        type="checkbox"
                                        aria-label={`Select ${r.name}`}
                                        checked={selectedIds.has(r.learnerId)}
                                        onChange={() => onToggleSelect(r.learnerId)}
                                    />
                                </td>
                                <td>
                                    <div className="la-who">
                                        <span className="la-who__name">{r.name}</span>
                                        <span className="la-who__sub">{showCohort ? r.cohortName : r.email}</span>
                                    </div>
                                </td>
                                <td><JourneyStepper steps={r.steps} /></td>
                                <td>
                                    <div className="la-watch">
                                        <span className="la-meter"><span style={{ width: `${r.watchPct}%` }} /></span>
                                        <span className="la-num">{r.watchPct}%</span>
                                    </div>
                                    <span className="la-who__sub">{r.watchedMins} of {r.durationMins} min</span>
                                </td>
                                <td>
                                    {!r.hasCheck ? (
                                        <span className="la-muted">No quiz</span>
                                    ) : r.awaitingReview ? (
                                        <span className="la-tag la-tag--action">Awaiting your grade</span>
                                    ) : r.passed ? (
                                        <span className="la-num">Passed, {r.score}%</span>
                                    ) : r.attempts > 0 ? (
                                        <span className="la-num la-text-high">Attempt {r.attempts}, {r.score}%</span>
                                    ) : (
                                        <span className="la-muted">Not attempted</span>
                                    )}
                                </td>
                                <td>
                                    {r.commentCount + r.questionCount === 0 ? (
                                        <span className="la-muted">None</span>
                                    ) : (
                                        <span className="la-activity">
                                            <span><MessageSquare size={13} /> {r.commentCount}</span>
                                            <span className={r.unansweredQuestions > 0 ? 'la-text-mod' : ''}>
                                                <HelpCircle size={13} /> {r.questionCount}
                                            </span>
                                        </span>
                                    )}
                                    <span className="la-who__sub">{r.lastActivity ? `Active ${fmtDate(r.lastActivity)}` : 'No activity'}</span>
                                </td>
                                <td>
                                    <span className={`la-risk la-risk--${r.risk}`}><i />{RISK_LABEL[r.risk]}</span>
                                    <span className="la-who__sub">{r.riskReason}</span>
                                </td>
                                <td className="la-col-go"><ChevronRight size={16} /></td>
                            </tr>
                        ))
                    )}
                </tbody>
            </table>
        </div>
    );
};