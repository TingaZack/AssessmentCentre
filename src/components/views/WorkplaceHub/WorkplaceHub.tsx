// src/views/WorkplaceHub/WorkplaceHub.tsx

import React from 'react';
import { useSearchParams } from 'react-router-dom';
import { Briefcase, Building2 } from 'lucide-react';
import { PlacementsDashboard } from '../../admin/PlacementsDashboard/PlacementsDashboard';
import { WorkplacesManager } from '../../admin/WorkplacesManager/WorkplacesManager';

export const WorkplaceHub: React.FC = () => {
    const [searchParams, setSearchParams] = useSearchParams();

    // Default to placements tab if none is specified
    const activeTab = searchParams.get('tab') || 'placements';

    const handleTabChange = (tab: 'placements' | 'directory') => {
        // We preserve other params (like employer=123) if switching back, 
        // or we can just clear them for a fresh start on the tab.
        setSearchParams({ tab });
    };

    return (
        <div className="animate-fade-in" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>

            {/* ── UNIFIED TAB BAR (Using Standard mLab Classes) ── */}
            <div className="lfm-tabs" style={{ marginBottom: '1.5rem', background: 'transparent' }}>
                <button
                    className={`lfm-tab ${activeTab === 'placements' ? 'active' : ''}`}
                    onClick={() => handleTabChange('placements')}
                >
                    <Briefcase size={16} /> Placements Ledger
                </button>

                <button
                    className={`lfm-tab ${activeTab === 'directory' ? 'active' : ''}`}
                    onClick={() => handleTabChange('directory')}
                >
                    <Building2 size={16} /> Host Companies & Mentors
                </button>
            </div>

            {/* ── DYNAMIC VIEW RENDERING ── */}
            <div style={{ flex: 1, overflowY: 'auto' }}>
                {activeTab === 'placements' ? (
                    <PlacementsDashboard />
                ) : (
                    <WorkplacesManager />
                )}
            </div>

        </div>
    );
};