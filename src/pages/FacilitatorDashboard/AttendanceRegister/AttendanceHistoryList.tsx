// src/components/FacilitatorPortal/AttendanceHistoryList/AttendanceHistoryList.tsx

// src/components/FacilitatorPortal/AttendanceHistoryList/AttendanceHistoryList.tsx
// mLab CI v2.1 — matches ViewPortfolio.css aesthetic

import React, { useState, useEffect } from 'react';
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore';
import { FileText, Calendar, ArrowRight, AlertTriangle, History, Users } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import './AttendanceHistoryList.css';
import { db } from '../../../lib/firebase';

export const AttendanceHistoryList: React.FC<{ facilitatorId?: string }> = ({ facilitatorId }) => {
    const navigate = useNavigate();
    const [history, setHistory] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchHistory = async () => {
            if (!facilitatorId) return;
            setLoading(true);
            setError(null);
            try {
                const q = query(
                    collection(db, 'attendance'),
                    where('facilitatorId', '==', facilitatorId),
                    orderBy('date', 'desc')
                );
                const snapshot = await getDocs(q);
                setHistory(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
            } catch (err: any) {
                console.error('Firestore Error:', err);
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };
        fetchHistory();
    }, [facilitatorId]);

    if (loading) return (
        <div className="ahl-loading">
            <div className="ahl-spinner" />
            Loading History…
        </div>
    );

    if (error) return (
        <div className="ahl-error">
            <div className="ahl-error__heading">
                <AlertTriangle size={16} /> Database Sync Error
            </div>
            <p className="ahl-error__message">{error}</p>
        </div>
    );

    return (
        <div className="ahl-animate">
            <div className="ahl-panel">
                <table className="ahl-table">
                    <thead>
                        <tr>
                            <th>Date Recorded</th>
                            <th>Attendance</th>
                            <th>Proofs</th>
                            <th className="ahl-col-right">Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        {history.length > 0 ? (
                            history.map(record => {
                                const proofCount = Object.keys(record.proofs || {}).length;
                                const presentCount = record.presentLearners?.length || 0;
                                return (
                                    <tr key={record.id}>
                                        <td>
                                            <div className="ahl-date">
                                                <Calendar size={15} className="ahl-date__icon" />
                                                {record.date}
                                            </div>
                                        </td>
                                        <td>
                                            <span className="ahl-badge ahl-badge--present">
                                                <Users size={11} /> {presentCount} Present
                                            </span>
                                        </td>
                                        <td>
                                            {proofCount > 0 ? (
                                                <span className="ahl-badge ahl-badge--proofs">
                                                    <FileText size={11} /> {proofCount} Attached
                                                </span>
                                            ) : (
                                                <span className="ahl-none">None</span>
                                            )}
                                        </td>
                                        <td className="ahl-col-right">
                                            <button
                                                className="ahl-btn"
                                                onClick={() => navigate(`/facilitator/attendance/${record.cohortId}?date=${record.date}`)}
                                            >
                                                Open Register <ArrowRight size={13} />
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })
                        ) : (
                            <tr>
                                <td colSpan={4}>
                                    <div className="ahl-empty">
                                        <div className="ahl-empty__icon"><History size={44} color="var(--mlab-green)" /></div>
                                        <p className="ahl-empty__title">No Records Yet</p>
                                        <p className="ahl-empty__sub">Saved attendance registers will appear here.</p>
                                    </div>
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

// import React, { useState, useEffect } from 'react';
// import { collection, query, where, getDocs, orderBy } from 'firebase/firestore';
// import { db } from '../../../lib/firebase';
// import { FileText, Calendar, ArrowRight, AlertTriangle, History, Users } from 'lucide-react';
// import { useNavigate } from 'react-router-dom';
// import './AttendanceHistoryList.css';

// export const AttendanceHistoryList: React.FC<{ facilitatorId?: string }> = ({ facilitatorId }) => {
//     const navigate = useNavigate();
//     const [history, setHistory] = useState<any[]>([]);
//     const [loading, setLoading] = useState(true);
//     const [error, setError] = useState<string | null>(null);

//     useEffect(() => {
//         const fetchHistory = async () => {
//             if (!facilitatorId) return;
//             setLoading(true);
//             setError(null);
//             try {
//                 const q = query(
//                     collection(db, 'attendance'),
//                     where('facilitatorId', '==', facilitatorId),
//                     orderBy('date', 'desc')
//                 );
//                 const snapshot = await getDocs(q);
//                 setHistory(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
//             } catch (err: any) {
//                 console.error('Firestore Error:', err);
//                 setError(err.message);
//             } finally {
//                 setLoading(false);
//             }
//         };
//         fetchHistory();
//     }, [facilitatorId]);

//     // ── Loading ──────────────────────────────────────────────────────────────
//     if (loading) return (
//         <div className="ahl-loading">
//             <div className="ahl-spinner" />
//             Loading History…
//         </div>
//     );

//     // ── Error ────────────────────────────────────────────────────────────────
//     if (error) return (
//         <div className="ahl-error">
//             <div className="ahl-error__heading">
//                 <AlertTriangle size={16} />
//                 Database Sync Error
//             </div>
//             <p className="ahl-error__message">{error}</p>
//         </div>
//     );

//     // ── Table ────────────────────────────────────────────────────────────────
//     return (
//         <div className="ahl-animate">
//             <div className="ahl-table-wrap">
//                 <table className="ahl-table">
//                     <thead>
//                         <tr>
//                             <th>Date Recorded</th>
//                             <th>Attendance</th>
//                             <th>Proofs</th>
//                             <th className="ahl-col-right">Action</th>
//                         </tr>
//                     </thead>
//                     <tbody>
//                         {history.length > 0 ? (
//                             history.map(record => {
//                                 const proofCount = Object.keys(record.proofs || {}).length;
//                                 const presentCount = record.presentLearners?.length || 0;

//                                 return (
//                                     <tr key={record.id}>
//                                         {/* Date */}
//                                         <td>
//                                             <div className="ahl-date">
//                                                 <Calendar size={15} className="ahl-date__icon" />
//                                                 {record.date}
//                                             </div>
//                                         </td>

//                                         {/* Present count */}
//                                         <td>
//                                             <span className="ahl-present-badge">
//                                                 <Users size={11} />
//                                                 {presentCount} Present
//                                             </span>
//                                         </td>

//                                         {/* Proofs */}
//                                         <td>
//                                             {proofCount > 0 ? (
//                                                 <span className="ahl-proofs ahl-proofs--attached">
//                                                     <FileText size={13} />
//                                                     {proofCount} Attached
//                                                 </span>
//                                             ) : (
//                                                 <span className="ahl-proofs ahl-proofs--none">None</span>
//                                             )}
//                                         </td>

//                                         {/* Action */}
//                                         <td className="ahl-col-right">
//                                             <button
//                                                 className="ahl-btn"
//                                                 onClick={() => navigate(`/facilitator/attendance/${record.cohortId}?date=${record.date}`)}
//                                             >
//                                                 Open Register <ArrowRight size={13} />
//                                             </button>
//                                         </td>
//                                     </tr>
//                                 );
//                             })
//                         ) : (
//                             <tr>
//                                 <td colSpan={4}>
//                                     <div className="ahl-empty">
//                                         <div className="ahl-empty__icon">
//                                             <History size={26} />
//                                         </div>
//                                         <p className="ahl-empty__title">No Records Yet</p>
//                                         <p className="ahl-empty__sub">Saved attendance registers will appear here.</p>
//                                     </div>
//                                 </td>
//                             </tr>
//                         )}
//                     </tbody>
//                 </table>
//             </div>
//         </div>
//     );
// };