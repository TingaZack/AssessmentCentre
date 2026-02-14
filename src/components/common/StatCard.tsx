import React from 'react';

interface StatCardProps {
    icon: React.ReactNode;
    title: string;
    value: number;
    color: string; // kept for future styling
}

export const StatCard: React.FC<StatCardProps> = ({ icon, title, value }) => (
    <div style={{ flex: '1 1 200px', background: 'rgba(128,128,128,0.05)', border: '1px solid rgba(128,128,128,0.1)', borderRadius: '8px', padding: '1.5rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <div style={{ padding: '1rem', borderRadius: '50%', background: 'rgba(128,128,128,0.1)' }}>{icon}</div>
        <div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>{value}</div>
            <div style={{ fontSize: '0.85rem', opacity: 0.7, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{title}</div>
        </div>
    </div>
);