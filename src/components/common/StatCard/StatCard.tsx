// // src/components/common/StatCard/StatCard.tsx

// import React from 'react';
// import './StatCard.css';

// export type StatCardColor = 'blue' | 'green' | 'amber' | 'slate' | 'emerald' | 'purple' | 'red';


// src/components/views/DashboardOverview/DashboardOverview.tsx

import '../../admin/WorkplacesManager/WorkplacesManager.css';
// import './DashboardOverview.css';

// ─── LOCAL STAT CARD (Reusing wm-card styles) ───
const StatCard = ({ title, value, icon, borderColor, onClick, hoverable }: any) => (
    <div
        className="wm-card"
        onClick={onClick}
        style={{
            borderTopColor: borderColor || 'var(--mlab-blue)',
            cursor: onClick ? 'pointer' : 'default',
            transform: hoverable ? undefined : 'none',
            transition: 'transform 0.2s, box-shadow 0.2s',
            height: '100%'
        }}
        onMouseEnter={e => {
            if (hoverable) {
                e.currentTarget.style.transform = 'translateY(-3px)';
                e.currentTarget.style.boxShadow = '0 8px 20px rgba(0,0,0,0.08)';
            }
        }}
        onMouseLeave={e => {
            if (hoverable) {
                e.currentTarget.style.transform = 'none';
                e.currentTarget.style.boxShadow = '0 2px 8px rgba(7, 63, 78, 0.05)';
            }
        }}
    >
        <div className="wm-card__header" style={{ paddingBottom: '0.5rem' }}>
            <h3 className="wm-card__name" style={{ fontSize: '0.85rem', color: 'var(--mlab-grey)' }}>{title}</h3>
            <div style={{ color: borderColor || 'var(--mlab-blue)', opacity: 0.8 }}>{icon}</div>
        </div>
        <div style={{ padding: '0 1.1rem 1.1rem', fontSize: '2.2rem', fontWeight: 'bold', color: 'var(--mlab-blue)', fontFamily: 'var(--font-heading)' }}>
            {value}
        </div>
    </div>
);

export default StatCard;