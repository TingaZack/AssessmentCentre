// src/components/FacilitatorPortal/AttendanceHistoryList/AttendanceHistoryList.tsx

import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore';
import { FileText, Calendar, ArrowRight, AlertTriangle, History, Users, Search } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { db } from '../../../lib/firebase';
import Loader from '../../../components/common/Loader/Loader';
import moment from 'moment';

// 🚀 Pulling in the unified LearnersView styles
import '../../../components/views/LearnersView/LearnersView.css';

// 🚀 MODULE-LEVEL CACHE
let cachedHistory: any[] | null = null;

export const AttendanceHistoryList: React.FC<{ facilitatorId?: string }> = ({ facilitatorId }) => {
    const navigate = useNavigate();

    // Check cache strictly on mount
    const [history, setHistory] = useState<any[]>(() => cachedHistory || []);
    const [loading, setLoading] = useState<boolean>(() => cachedHistory === null);
    const [error, setError] = useState<string | null>(null);

    // 🚀 Added search state
    const [searchTerm, setSearchTerm] = useState('');

    useEffect(() => {
        const fetchHistory = async () => {
            if (!facilitatorId) return;

            if (cachedHistory === null) {
                setLoading(true);
            }

            setError(null);

            try {
                const q = query(
                    collection(db, 'attendance'),
                    where('facilitatorId', '==', facilitatorId),
                    orderBy('date', 'desc')
                );
                const snapshot = await getDocs(q);
                const freshData = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));

                cachedHistory = freshData;
                setHistory(freshData);
            } catch (err: any) {
                console.error('Firestore Error:', err);
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };

        fetchHistory();
    }, [facilitatorId]);

    // 🚀 Added filtering logic
    const filteredHistory = useMemo(() => {
        if (!searchTerm) return history;
        const lower = searchTerm.toLowerCase();
        return history.filter(record => {
            const formattedDate = moment(record.date).format('DD MMM YYYY').toLowerCase();
            return formattedDate.includes(lower) || record.date.includes(lower);
        });
    }, [history, searchTerm]);

    if (loading || !facilitatorId) return (
        <div className="animate-fade-in" style={{ padding: '4rem 0', display: 'flex', justifyContent: 'center', width: '100%' }}>
            <Loader message="Loading History..." />
        </div>
    );

    if (error) return (
        <div style={{ padding: '2rem', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', color: '#b91c1c', margin: '1rem 0' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 'bold', marginBottom: '8px' }}>
                <AlertTriangle size={16} /> Database Sync Error
            </div>
            <p style={{ margin: 0, fontSize: '0.9rem' }}>{error}</p>
        </div>
    );

    return (
        <div className="mlab-learners animate-fade-in" style={{ paddingBottom: 16, margin: 0 }}>

            {/* 🚀 Added the unified search toolbar */}
            <div className="mlab-toolbar">
                <div className="mlab-search">
                    <Search size={18} color="var(--mlab-grey)" />
                    <input
                        type="text"
                        placeholder="Search by date (e.g. 12 Oct)..."
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                    />
                </div>
            </div>

            <div className="mlab-table-wrap">
                <table className="mlab-table">
                    <thead>
                        <tr>
                            <th>Date Recorded</th>
                            <th>Attendance</th>
                            <th>Proofs</th>
                            <th style={{ textAlign: 'right' }}>Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredHistory.length > 0 ? (
                            filteredHistory.map(record => {
                                const proofCount = Object.keys(record.proofs || {}).length;
                                const presentCount = record.presentLearners?.length || 0;
                                return (
                                    <tr key={record.id}>
                                        <td>
                                            <div className="mlab-cell-content" style={{ flexDirection: 'row', alignItems: 'center', gap: '8px' }}>
                                                <Calendar size={15} color="var(--mlab-blue)" />
                                                <span className="mlab-cell-name">{moment(record.date).format('DD MMM YYYY')}</span>
                                            </div>
                                        </td>
                                        <td>
                                            <span className="mlab-badge mlab-badge--active" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                                <Users size={11} /> {presentCount} Present
                                            </span>
                                        </td>
                                        <td>
                                            {proofCount > 0 ? (
                                                <span className="mlab-badge" style={{ background: '#f1f5f9', color: '#475569', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                                    <FileText size={11} /> {proofCount} Attached
                                                </span>
                                            ) : (
                                                <span style={{ color: '#94a3b8', fontSize: '0.85rem' }}>None</span>
                                            )}
                                        </td>
                                        <td style={{ textAlign: 'right' }}>
                                            <button
                                                className="mlab-btn mlab-btn--outline mlab-btn--outline-blue"
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
                                    {history.length === 0 ? (
                                        <div className="mlab-empty">
                                            <History size={40} color="var(--mlab-green)" className="mlab-empty-icon" />
                                            <p className="mlab-empty__title">No Records Yet</p>
                                            <p className="mlab-empty__desc">Saved attendance registers will appear here.</p>
                                        </div>
                                    ) : (
                                        <div className="mlab-empty">
                                            <Search size={40} color="var(--mlab-green)" className="mlab-empty-icon" />
                                            <p className="mlab-empty__title">No matches found</p>
                                            <p className="mlab-empty__desc">Try adjusting your search term.</p>
                                            <button
                                                className="mlab-btn mlab-btn--outline"
                                                onClick={() => setSearchTerm('')}
                                                style={{ marginTop: '1rem' }}
                                            >
                                                Clear Search
                                            </button>
                                        </div>
                                    )}
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};