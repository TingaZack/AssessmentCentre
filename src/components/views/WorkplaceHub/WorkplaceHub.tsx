// src/components/views/WorkplaceHub/WorkplaceHub.tsx

import React from 'react';
import { useSearchParams } from 'react-router-dom';
import { Briefcase, Building2 } from 'lucide-react';
import { WorkplacesManager } from '../../admin/WorkplacesManager/WorkplacesManager';
import { PlacementsDashboard } from '../../admin/PlacementsDashboard/PlacementsDashboard';

export const WorkplaceHub: React.FC = () => {
    const [searchParams, setSearchParams] = useSearchParams();

    // We now use "view" instead of "tab" so it doesn't fight with the AdminDashboard!
    // If there is no view specified, it safely defaults to 'placements'.
    const activeView = searchParams.get('view') || 'placements';

    const handleTabChange = (view: 'placements' | 'directory') => {
        // We grab the existing URL parameters (like ?tab=workplaces)
        const params = new URLSearchParams(searchParams);

        // We append or update ONLY the 'view' parameter
        params.set('view', view);

        // We push the updated parameters back to the URL without destroying the rest!
        setSearchParams(params, { replace: true });
    };

    return (
        <div className="animate-fade-in" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>

            <div className="animate-fade-in" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>

                {/* ── UNIFIED TAB BAR ── */}
                <div className="lfm-tabs" style={{ marginBottom: '1.5rem', background: 'transparent' }}>
                    <button
                        className={`lfm-tab ${activeView === 'placements' ? 'active' : ''}`}
                        onClick={() => handleTabChange('placements')}
                    >
                        <Briefcase size={16} /> Placements Ledger
                    </button>

                    <button
                        className={`lfm-tab ${activeView === 'directory' ? 'active' : ''}`}
                        onClick={() => handleTabChange('directory')}
                    >
                        <Building2 size={16} /> Host Companies & Mentors
                    </button>
                </div>

                {/* ── DYNAMIC VIEW RENDERING ── */}
                <div style={{ flex: 1, overflowY: 'auto' }}>
                    {activeView === 'placements' ? (
                        <PlacementsDashboard />
                    ) : (
                        <WorkplacesManager />
                    )}
                </div>

            </div>
            {/* <div className="lfm-tabs" style={{ marginBottom: '1.5rem', background: 'transparent' }}>
                <button
                    className={`lfm-tab ${activeView === 'placements' ? 'active' : ''}`}
                    onClick={() => handleTabChange('placements')}
                >
                    <Briefcase size={16} /> Placements Ledger
                </button>

                <button
                    className={`lfm-tab ${activeView === 'directory' ? 'active' : ''}`}
                    onClick={() => handleTabChange('directory')}
                >
                    <Building2 size={16} /> Host Companies & Mentors
                </button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto' }}>
                {activeView === 'placements' ? (
                    <PlacementsManager />
                ) : (
                    <WorkplacesManager />
                )}
            </div> */}

        </div>
    );
};


// // src/views/WorkplaceHub/WorkplaceHub.tsx

// import React from 'react';
// import { useSearchParams } from 'react-router-dom';
// import { Briefcase, Building2 } from 'lucide-react';
// import { PlacementsDashboard } from '../../admin/PlacementsDashboard/PlacementsDashboard';
// import { WorkplacesManager } from '../../admin/WorkplacesManager/WorkplacesManager';

// export const WorkplaceHub: React.FC = () => {
//     const [searchParams, setSearchParams] = useSearchParams();

//     // We now use "view" instead of "tab" so it doesn't fight with the AdminDashboard!
//     // If there is no view specified, it safely defaults to 'placements'.
//     const activeView = searchParams.get('view') || 'placements';

//     const handleTabChange = (view: 'placements' | 'directory') => {
//         // We grab the existing URL parameters (like ?tab=workplaces)
//         const params = new URLSearchParams(searchParams);

//         // We append or update ONLY the 'view' parameter
//         params.set('view', view);

//         // We push the updated parameters back to the URL without destroying the rest!
//         setSearchParams(params, { replace: true });
//     };

//     return (
//         <div className="animate-fade-in" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>

//             {/* ── UNIFIED TAB BAR ── */}
//             <div className="lfm-tabs" style={{ marginBottom: '1.5rem', background: 'transparent' }}>
//                 <button
//                     className={`lfm-tab ${activeView === 'placements' ? 'active' : ''}`}
//                     onClick={() => handleTabChange('placements')}
//                 >
//                     <Briefcase size={16} /> Placements Ledger
//                 </button>

//                 <button
//                     className={`lfm-tab ${activeView === 'directory' ? 'active' : ''}`}
//                     onClick={() => handleTabChange('directory')}
//                 >
//                     <Building2 size={16} /> Host Companies & Mentors
//                 </button>
//             </div>

//             {/* ── DYNAMIC VIEW RENDERING ── */}
//             <div style={{ flex: 1, overflowY: 'auto' }}>
//                 {activeView === 'placements' ? (
//                     <PlacementsDashboard />
//                 ) : (
//                     <WorkplacesManager />
//                 )}
//             </div>

//         </div>
//     );
// };