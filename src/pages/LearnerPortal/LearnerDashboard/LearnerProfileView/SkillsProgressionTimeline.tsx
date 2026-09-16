// src/components/views/LearnerProfileView/SkillsProgressionTimeline.tsx

import React, { useState } from 'react';
import { Award, TrendingUp, Sparkles, CheckCircle2, ArrowRight, Zap, History } from 'lucide-react';
import moment from 'moment';
// import './SkillsProgressionTimeline.css';

export interface SkillHistoryEntry {
    id: string;
    skillId: string;
    skillName: string;
    category?: string;
    previousLevel?: string;
    newLevel: string;
    updatedAt: string;
}

interface SkillsProgressionTimelineProps {
    skills: any[];
    skillsHistory: SkillHistoryEntry[];
}

const LEVEL_CONFIG: Record<string, { rank: number; color: string; bg: string; border: string; label: string }> = {
    beginner: { rank: 1, color: '#0284c7', bg: '#e0f2fe', border: '#bae6fd', label: 'Beginner' },
    novice: { rank: 1, color: '#0284c7', bg: '#e0f2fe', border: '#bae6fd', label: 'Beginner' },
    intermediate: { rank: 2, color: '#d97706', bg: '#fffbeb', border: '#fde68a', label: 'Intermediate' },
    advanced: { rank: 3, color: '#16a34a', bg: '#f0fdf4', border: '#bbf7d0', label: 'Advanced' },
    expert: { rank: 4, color: '#7c3aed', bg: '#f5f3ff', border: '#ddd6fe', label: 'Expert' },
    master: { rank: 4, color: '#7c3aed', bg: '#f5f3ff', border: '#ddd6fe', label: 'Expert' }
};

const getLevelMeta = (levelStr: string) => {
    const key = (levelStr || 'beginner').toLowerCase().trim();
    return LEVEL_CONFIG[key] || LEVEL_CONFIG.beginner;
};

export const SkillsProgressionTimeline: React.FC<SkillsProgressionTimelineProps> = ({ skills = [], skillsHistory = [] }) => {
    const [viewMode, setViewMode] = useState<'milestones' | 'history'>('milestones');

    // Sort history newest first
    const sortedHistory = [...skillsHistory].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

    return (
        <div className="spt-container">
            {/* INJECTED CSS ANIMATIONS & STYLES */}
            <style dangerouslySetInnerHTML={{
                __html: `
                .spt-container {
                    background: #ffffff;
                    border: 1px solid var(--mlab-border, #e2e8f0);
                    border-radius: 6px;
                    padding: 1.5rem;
                    margin-top: 1.5rem;
                }
                .spt-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 1.25rem;
                    border-bottom: 1px solid var(--mlab-border, #e2e8f0);
                    padding-bottom: 1rem;
                }
                .spt-title {
                    font-family: var(--font-heading, sans-serif);
                    font-size: 1rem;
                    font-weight: 800;
                    color: var(--mlab-midnight, #073f4e);
                    text-transform: uppercase;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    margin: 0;
                }
                .spt-toggle-group {
                    display: flex;
                    gap: 6px;
                    background: #f1f5f9;
                    padding: 3px;
                    border-radius: 6px;
                }
                .spt-toggle-btn {
                    border: none;
                    background: transparent;
                    padding: 5px 12px;
                    font-size: 0.75rem;
                    font-weight: 700;
                    color: #64748b;
                    cursor: pointer;
                    border-radius: 4px;
                    transition: all 0.2s ease;
                    display: flex;
                    align-items: center;
                    gap: 5px;
                }
                .spt-toggle-btn.active {
                    background: #ffffff;
                    color: var(--mlab-blue, #0284c7);
                    box-shadow: 0 1px 3px rgba(0,0,0,0.1);
                }

                /* MILESTONE GRID */
                .spt-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
                    gap: 1rem;
                }
                .spt-card {
                    background: #f8fafc;
                    border: 1px solid #e2e8f0;
                    border-radius: 6px;
                    padding: 1rem;
                    display: flex;
                    flex-direction: column;
                    gap: 0.75rem;
                    position: relative;
                    transition: transform 0.2s ease, box-shadow 0.2s ease;
                }
                .spt-card:hover {
                    transform: translateY(-2px);
                    box-shadow: 0 4px 12px rgba(0,0,0,0.05);
                }
                .spt-card-hdr {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                }
                .spt-skill-name {
                    font-weight: 800;
                    font-size: 0.9rem;
                    color: #0f172a;
                    margin: 0;
                }
                .spt-category-tag {
                    font-size: 0.65rem;
                    font-weight: 700;
                    color: #64748b;
                    text-transform: uppercase;
                    letter-spacing: 0.05em;
                }

                /* PROGRESS METER STAGES */
                .spt-stages {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    position: relative;
                    margin-top: 6px;
                }
                .spt-stage-line {
                    position: absolute;
                    top: 50%;
                    left: 0;
                    right: 0;
                    height: 4px;
                    background: #e2e8f0;
                    z-index: 1;
                    transform: translateY(-50%);
                }
                .spt-stage-line-active {
                    position: absolute;
                    top: 50%;
                    left: 0;
                    height: 4px;
                    background: linear-gradient(90deg, #0284c7 0%, #16a34a 60%, #7c3aed 100%);
                    z-index: 2;
                    transform: translateY(-50%);
                    transition: width 1s cubic-bezier(0.4, 0, 0.2, 1);
                }
                .spt-node {
                    width: 24px;
                    height: 24px;
                    border-radius: 50%;
                    background: #ffffff;
                    border: 2px solid #cbd5e1;
                    z-index: 3;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 0.65rem;
                    font-weight: 800;
                    color: #94a3b8;
                    transition: all 0.3s ease;
                }
                .spt-node.reached {
                    border-color: #0284c7;
                    background: #0284c7;
                    color: #ffffff;
                    animation: pulseGlow 1.8s infinite;
                }
                .spt-node.current {
                    border-color: #7c3aed;
                    background: #7c3aed;
                    color: #ffffff;
                    transform: scale(1.15);
                    box-shadow: 0 0 10px rgba(124, 58, 237, 0.5);
                }
                .spt-labels {
                    display: flex;
                    justify-content: space-between;
                    font-size: 0.65rem;
                    font-weight: 700;
                    color: #64748b;
                    margin-top: 4px;
                    text-transform: uppercase;
                }

                /* CHRONOLOGICAL TIMELINE FEED */
                .spt-feed {
                    display: flex;
                    flex-direction: column;
                    gap: 12px;
                    position: relative;
                    padding-left: 1.5rem;
                }
                .spt-feed::before {
                    content: '';
                    position: absolute;
                    left: 8px;
                    top: 6px;
                    bottom: 6px;
                    width: 2px;
                    background: #e2e8f0;
                }
                .spt-feed-item {
                    position: relative;
                    background: #f8fafc;
                    border: 1px solid #e2e8f0;
                    padding: 10px 14px;
                    border-radius: 6px;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    animation: slideInNode 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards;
                }
                .spt-feed-item::before {
                    content: '';
                    position: absolute;
                    left: -1.5rem;
                    top: 50%;
                    width: 10px;
                    height: 10px;
                    border-radius: 50%;
                    background: #0284c7;
                    border: 2px solid #ffffff;
                    transform: translate(-50%, -50%);
                    box-shadow: 0 0 0 2px #bae6fd;
                }

                @keyframes pulseGlow {
                    0% { box-shadow: 0 0 0 0 rgba(2, 132, 199, 0.4); }
                    70% { box-shadow: 0 0 0 6px rgba(2, 132, 199, 0); }
                    100% { box-shadow: 0 0 0 0 rgba(2, 132, 199, 0); }
                }
                @keyframes slideInNode {
                    from { opacity: 0; transform: translateX(-10px); }
                    to { opacity: 1; transform: translateX(0); }
                }
            ` }} />

            <div className="spt-header">
                <h3 className="spt-title">
                    <Sparkles size={18} color="var(--mlab-green, #94c73d)" /> Skills Progression Timeline
                </h3>
                <div className="spt-toggle-group">
                    <button
                        type="button"
                        className={`spt-toggle-btn ${viewMode === 'milestones' ? 'active' : ''}`}
                        onClick={() => setViewMode('milestones')}
                    >
                        <Award size={13} /> Active Mastery ({skills.length})
                    </button>
                    <button
                        type="button"
                        className={`spt-toggle-btn ${viewMode === 'history' ? 'active' : ''}`}
                        onClick={() => setViewMode('history')}
                    >
                        <History size={13} /> Promotion Audit ({sortedHistory.length})
                    </button>
                </div>
            </div>

            {viewMode === 'milestones' ? (
                skills.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '2rem', color: '#94a3b8' }}>
                        <Zap size={32} style={{ margin: '0 auto 0.5rem', opacity: 0.5 }} />
                        <p style={{ margin: 0, fontSize: '0.85rem' }}>No technical skills registered yet. Add skills above to ignite your timeline!</p>
                    </div>
                ) : (
                    <div className="spt-grid">
                        {skills.map((skill, index) => {
                            const currentMeta = getLevelMeta(skill.level || 'beginner');
                            const progressPct = ((currentMeta.rank) / 4) * 100;

                            return (
                                <div key={skill.id || index} className="spt-card">
                                    <div className="spt-card-hdr">
                                        <div>
                                            <h4 className="spt-skill-name">{skill.name || skill.label}</h4>
                                            {skill.category && <span className="spt-category-tag">{skill.category}</span>}
                                        </div>
                                        <span style={{
                                            fontSize: '0.7rem',
                                            fontWeight: 800,
                                            padding: '2px 8px',
                                            borderRadius: '4px',
                                            background: currentMeta.bg,
                                            color: currentMeta.color,
                                            border: `1px solid ${currentMeta.border}`,
                                            textTransform: 'uppercase'
                                        }}>
                                            {currentMeta.label}
                                        </span>
                                    </div>

                                    {/* PROGRESSION PATHWAY METERS */}
                                    <div className="spt-stages">
                                        <div className="spt-stage-line" />
                                        <div className="spt-stage-line-active" style={{ width: `${progressPct}%` }} />

                                        {[1, 2, 3, 4].map((stepRank) => {
                                            const isReached = currentMeta.rank >= stepRank;
                                            const isCurrent = currentMeta.rank === stepRank;
                                            return (
                                                <div
                                                    key={stepRank}
                                                    className={`spt-node ${isReached ? 'reached' : ''} ${isCurrent ? 'current' : ''}`}
                                                    title={`Tier ${stepRank}`}
                                                >
                                                    {isReached ? <CheckCircle2 size={12} /> : stepRank}
                                                </div>
                                            );
                                        })}
                                    </div>

                                    <div className="spt-labels">
                                        <span>Beginner</span>
                                        <span>Intermediate</span>
                                        <span>Advanced</span>
                                        <span>Expert</span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )
            ) : (
                sortedHistory.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '2rem', color: '#94a3b8' }}>
                        <History size={32} style={{ margin: '0 auto 0.5rem', opacity: 0.5 }} />
                        <p style={{ margin: 0, fontSize: '0.85rem' }}>No promotion records logged yet. Updating your skill levels during editing creates timestamped milestones here.</p>
                    </div>
                ) : (
                    <div className="spt-feed">
                        {sortedHistory.map((item) => {
                            const prevMeta = getLevelMeta(item.previousLevel || 'None');
                            const newMeta = getLevelMeta(item.newLevel || 'Beginner');

                            return (
                                <div key={item.id} className="spt-feed-item">
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                        <div style={{ background: '#f1f5f9', padding: '6px', borderRadius: '50%' }}>
                                            <TrendingUp size={14} color="#0284c7" />
                                        </div>
                                        <div>
                                            <strong style={{ fontSize: '0.85rem', color: '#0f172a', display: 'block' }}>
                                                {item.skillName}
                                            </strong>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
                                                <span style={{ fontSize: '0.7rem', color: '#64748b' }}>{prevMeta.label}</span>
                                                <ArrowRight size={10} color="#94a3b8" />
                                                <span style={{ fontSize: '0.7rem', fontWeight: 800, color: newMeta.color }}>{newMeta.label}</span>
                                            </div>
                                        </div>
                                    </div>
                                    <div style={{ textAlign: 'right' }}>
                                        <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#475569', display: 'block' }}>
                                            {moment(item.updatedAt).format('D MMM YYYY')}
                                        </span>
                                        <span style={{ fontSize: '0.65rem', color: '#94a3b8' }}>
                                            {moment(item.updatedAt).format('HH:mm')}
                                        </span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )
            )}
        </div>
    );
};