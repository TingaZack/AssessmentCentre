// src/components/common/ModuleProgressCard/ModuleProgressCard.tsx

import React, { useState, useEffect } from 'react';

export interface ModuleProgressCardProps {
    type: 'Knowledge' | 'Practical' | 'Workplace';
    data: { total: number; logged: number };
}

export const ModuleProgressCard: React.FC<ModuleProgressCardProps> = ({ type, data }) => {
    const [animatedPct, setAnimatedPct] = useState(0);

    const targetPct = data.total > 0 ? Math.round((data.logged / data.total) * 100) : 0;
    const remaining = data.total - data.logged;
    const remainingPct = data.total > 0 ? Math.round((remaining / data.total) * 100) : (data.total === 0 ? 0 : 100);

    useEffect(() => {
        const t = setTimeout(() => setAnimatedPct(targetPct), 150);
        return () => clearTimeout(t);
    }, [targetPct]);

    const C = 282.6; // Circumference for r=45
    const offset = C - (C * animatedPct / 100);

    const isStarted = data.logged > 0;
    const isComplete = data.total > 0 && data.logged === data.total;

    const config = {
        Knowledge: {
            cls: 'mc-k', title: 'Knowledge Modules', fillId: 'rK',
            icon: <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2z" /><path d="M22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z" /></svg>
        },
        Practical: {
            cls: 'mc-p', title: 'Practical Modules', fillId: 'rP',
            icon: <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z" /></svg>
        },
        Workplace: {
            cls: 'mc-w', title: 'Workplace Modules', fillId: 'rW',
            icon: <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#94c73d" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="14" rx="3" /><path d="M16 3H8a2 2 0 00-2 2v2h12V5a2 2 0 00-2-2z" /></svg>
        },
    };

    const { cls, title, icon, fillId } = config[type];

    return (
        <div className={`mc ${cls}`}>
            <div className="mc-orb"></div>
            <div className="mc-hdr">
                <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                    <div className="mc-icon">{icon}</div>
                    <div>
                        <div className="mc-label">Module Type</div>
                        <div className="mc-title">{title}</div>
                    </div>
                </div>
                <div className="mc-pct">{targetPct}%</div>
            </div>

            <div className="mc-ring-wrap">
                <svg className="mc-ring-svg" width="110" height="110" viewBox="0 0 100 100">
                    <circle className="mc-ring-track" cx="50" cy="50" r="45" />
                    <circle className="mc-ring-fill" id={fillId} cx="50" cy="50" r="45" style={{ strokeDashoffset: offset }} />
                </svg>
                <div className="mc-ring-center">
                    <div className="mc-ring-num">{data.logged}</div>
                    <div className="mc-ring-denom">of {data.total} topics</div>
                </div>
            </div>

            <div className="mc-bars">
                <div className="mc-bar-item">
                    <div className="mc-bar-meta"><span className="mc-bar-lbl">Covered</span><span className="mc-bar-val">{data.logged} topics</span></div>
                    <div className="mc-track"><div className="mc-fill mc-fill-primary mc-fill-shimmer" style={{ width: `${animatedPct}%` }}></div></div>
                </div>
                <div className="mc-bar-item">
                    <div className="mc-bar-meta"><span className="mc-bar-lbl">Remaining</span><span className="mc-bar-val">{remaining} topics</span></div>
                    <div className="mc-track"><div className="mc-fill mc-fill-secondary" style={{ width: `${data.total === 0 ? 0 : remainingPct}%` }}></div></div>
                </div>
            </div>

            <div className="mc-footer">
                <span className="mc-total"><strong>{data.total}</strong> total topics</span>
                <span className="mc-status">
                    {isComplete ? 'Complete' : isStarted ? <><span className="mc-dot"></span>In Progress</> : 'Not Started'}
                </span>
            </div>
        </div>
    );
};