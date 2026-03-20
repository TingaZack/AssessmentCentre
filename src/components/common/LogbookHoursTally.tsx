import React from 'react';
import { CalendarRange, AlertTriangle } from 'lucide-react';

export const LogbookHoursTally: React.FC<{ entries: any[]; requiredHours?: number }> = ({ entries, requiredHours }) => {
    const totalHours = entries.reduce((acc, curr) => acc + (Number(curr.hours) || 0), 0);
    const isShort = requiredHours !== undefined && totalHours < requiredHours;
    const isMet = requiredHours !== undefined && totalHours >= requiredHours;

    return (
        <div style={{
            marginTop: '1rem',
            padding: '1rem 1.25rem',
            borderRadius: '8px',
            border: `2px solid ${isShort ? '#fca5a5' : isMet ? '#86efac' : '#e2e8f0'}`,
            background: isShort ? '#fef2f2' : isMet ? '#f0fdf4' : '#f8fafc',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '12px'
        }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <CalendarRange size={20} color={isShort ? '#ef4444' : isMet ? '#22c55e' : '#64748b'} />
                <div>
                    <div style={{ fontSize: '0.75rem', fontWeight: 'bold', textTransform: 'uppercase', color: isShort ? '#b91c1c' : isMet ? '#166534' : '#475569', letterSpacing: '0.05em' }}>
                        Total Logged Hours
                    </div>
                    {requiredHours !== undefined && (
                        <div style={{ fontSize: '0.75rem', color: isShort ? '#ef4444' : isMet ? '#22c55e' : '#64748b', marginTop: '2px' }}>
                            {isMet ? `✓ Minimum ${requiredHours}h requirement met` : `Minimum ${requiredHours}h required`}
                        </div>
                    )}
                </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
                <span style={{ fontSize: '2rem', fontWeight: 'bold', fontFamily: 'var(--font-heading)', color: isShort ? '#ef4444' : isMet ? '#16a34a' : '#073f4e' }}>
                    {totalHours}
                </span>
                {requiredHours !== undefined && (
                    <span style={{ fontSize: '1rem', color: '#94a3b8', fontFamily: 'var(--font-heading)' }}>/ {requiredHours}h</span>
                )}
                {requiredHours === undefined && (
                    <span style={{ fontSize: '0.85rem', color: '#94a3b8' }}>hrs</span>
                )}
            </div>
            {isShort && (
                <div style={{ width: '100%', background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: '6px', padding: '8px 12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <AlertTriangle size={16} color="#dc2626" />
                    <span style={{ fontSize: '0.8rem', color: '#b91c1c', fontWeight: 'bold' }}>
                        Warning: {requiredHours! - totalHours}h short of the required minimum. Do not verify until the learner corrects their logbook.
                    </span>
                </div>
            )}
        </div>
    );
};