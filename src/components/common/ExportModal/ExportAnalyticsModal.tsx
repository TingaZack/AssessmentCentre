// src/components/common/ExportModal/ExportAnalyticsModal.tsx

import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { DownloadCloud, X, ShieldCheck, FileSpreadsheet, Layers, Filter, FileText, ClipboardList } from 'lucide-react';
import type { DashboardLearner } from '../../../types';
import { generateAnalyticsExport, type ExportOptions } from '../../../pages/utils/analyticsExport';

interface Props {
    isOpen: boolean;
    onClose: () => void;
    allLearners: DashboardLearner[];
    filteredLearners: DashboardLearner[];
    cohortAnalytics: any;
    cohortName: string;
    surveyTemplates?: any[];
    cohortSurveyResponses?: any[];
}

export const ExportAnalyticsModal: React.FC<Props> = ({
    isOpen, onClose, allLearners, filteredLearners, cohortAnalytics, cohortName, surveyTemplates = [], cohortSurveyResponses = []
}) => {
    const [dataScope, setDataScope] = useState<'filtered' | 'full'>('filtered');
    const [preset, setPreset] = useState<'csi' | 'ddm' | 'seta' | 'master'>('ddm');
    const [popiaEnabled, setPopiaEnabled] = useState(true);
    const [includeSummaryTab, setIncludeSummaryTab] = useState(true);
    const [fileFormat, setFileFormat] = useState<'xlsx' | 'csv'>('xlsx');

    // Survey Selection State
    const [selectedSurveyId, setSelectedSurveyId] = useState<string>('');

    if (!isOpen) return null;

    const handlePresetChange = (selectedPreset: 'csi' | 'ddm' | 'seta' | 'master') => {
        setPreset(selectedPreset);
        if (selectedPreset === 'csi' || selectedPreset === 'ddm') {
            setPopiaEnabled(true);
            setIncludeSummaryTab(true);
        } else if (selectedPreset === 'seta') {
            setPopiaEnabled(false);
            setIncludeSummaryTab(true);
        } else {
            setIncludeSummaryTab(true);
        }
    };

    const handleExecuteExport = () => {
        const options: ExportOptions = {
            dataScope,
            preset,
            popiaEnabled,
            includeSummaryTab,
            fileFormat,
            cohortName,
            selectedSurveyId,
            surveyTemplates,
            cohortSurveyResponses
        };

        generateAnalyticsExport(allLearners, filteredLearners, cohortAnalytics, options);
        onClose();
    };

    const targetCount = dataScope === 'filtered' ? filteredLearners.length : allLearners.length;

    return createPortal(
        <div className="lfm-overlay animate-fade-in" onClick={onClose} style={{ zIndex: 999999 }}>
            <div className="lfm-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '620px' }}>

                {/* Modal Header */}
                <div className="lfm-header">
                    <h2 className="lfm-header__title">
                        <DownloadCloud size={18} /> Export Cohort Analytics & Intelligence
                    </h2>
                    <button className="lfm-close-btn" type="button" onClick={onClose}>
                        <X size={20} />
                    </button>
                </div>

                {/* Modal Body */}
                <div className="lfm-body" style={{ padding: '1.5rem', gap: '1.5rem' }}>

                    {/* Section 1: Data Scope */}
                    <div>
                        <div className="lfm-section-hdr">
                            <Filter size={13} /> 1. Select Export Data Scope
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                            <label style={{
                                display: 'flex', flexDirection: 'column', padding: '12px', cursor: 'pointer',
                                border: `2px solid ${dataScope === 'filtered' ? 'var(--mlab-blue)' : 'var(--mlab-border)'}`,
                                background: dataScope === 'filtered' ? 'var(--mlab-light-blue)' : 'var(--mlab-white)',
                                transition: 'all 0.2s'
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                                    <input
                                        type="radio"
                                        name="dataScope"
                                        checked={dataScope === 'filtered'}
                                        onChange={() => setDataScope('filtered')}
                                        style={{ accentColor: 'var(--mlab-green)' }}
                                    />
                                    <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: '0.85rem', color: 'var(--mlab-blue)', textTransform: 'uppercase' }}>Filtered View</span>
                                </div>
                                <span style={{ fontSize: '0.75rem', color: 'var(--mlab-grey)' }}>
                                    Exports <strong>{filteredLearners.length}</strong> matching records currently visible on screen.
                                </span>
                            </label>

                            <label style={{
                                display: 'flex', flexDirection: 'column', padding: '12px', cursor: 'pointer',
                                border: `2px solid ${dataScope === 'full' ? 'var(--mlab-blue)' : 'var(--mlab-border)'}`,
                                background: dataScope === 'full' ? 'var(--mlab-light-blue)' : 'var(--mlab-white)',
                                transition: 'all 0.2s'
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                                    <input
                                        type="radio"
                                        name="dataScope"
                                        checked={dataScope === 'full'}
                                        onChange={() => setDataScope('full')}
                                        style={{ accentColor: 'var(--mlab-green)' }}
                                    />
                                    <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: '0.85rem', color: 'var(--mlab-blue)', textTransform: 'uppercase' }}>Full Cohort Roster</span>
                                </div>
                                <span style={{ fontSize: '0.75rem', color: 'var(--mlab-grey)' }}>
                                    Exports all <strong>{allLearners.length}</strong> baseline learners registered in this cohort.
                                </span>
                            </label>
                        </div>
                    </div>

                    {/* Section 2: Stakeholder Presets */}
                    <div>
                        <div className="lfm-section-hdr">
                            <Layers size={13} /> 2. Stakeholder Target Profile Presets
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '8px' }}>
                            {[
                                { id: 'ddm', label: 'Government & DDM', desc: 'Municipal & Metro Focus' },
                                { id: 'csi', label: 'Corporate CSI', desc: 'Impact & Demographics' },
                                { id: 'seta', label: 'SETA / QCTO Audit', desc: 'Full Compliance Audit' },
                                { id: 'master', label: 'Universal Master', desc: 'Custom Unrestricted' }
                            ].map(p => (
                                <button
                                    key={p.id}
                                    type="button"
                                    onClick={() => handlePresetChange(p.id as any)}
                                    style={{
                                        padding: '10px', textAlign: 'left', cursor: 'pointer', borderRadius: 0,
                                        border: `1px solid ${preset === p.id ? 'var(--mlab-blue)' : 'var(--mlab-border)'}`,
                                        borderLeft: preset === p.id ? '4px solid var(--mlab-green)' : '1px solid var(--mlab-border)',
                                        background: preset === p.id ? 'var(--mlab-light-blue)' : 'var(--mlab-white)',
                                        transition: 'all 0.2s'
                                    }}
                                >
                                    <div style={{ fontFamily: 'var(--font-heading)', fontSize: '0.75rem', fontWeight: 700, color: 'var(--mlab-blue)', textTransform: 'uppercase' }}>
                                        {p.label}
                                    </div>
                                    <div style={{ fontSize: '0.65rem', color: 'var(--mlab-grey)', marginTop: '2px' }}>
                                        {p.desc}
                                    </div>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Section 3: Attach Survey Feedback */}
                    <div>
                        <div className="lfm-section-hdr">
                            <ClipboardList size={13} /> 3. Attach Survey Feedback (Optional)
                        </div>
                        <p style={{ fontSize: '0.75rem', color: 'var(--mlab-grey)', marginBottom: '8px' }}>
                            Appends each learner's answers from a specific survey template as new columns in the export.
                        </p>
                        <select
                            className="lfm-input lfm-select"
                            value={selectedSurveyId}
                            onChange={e => setSelectedSurveyId(e.target.value)}
                            style={{ width: '100%', borderRadius: 0 }}
                        >
                            <option value="">-- No Survey Data Attached --</option>
                            {surveyTemplates.map(s => (
                                <option key={s.id} value={s.id}>{s.title}</option>
                            ))}
                        </select>
                    </div>

                    {/* Section 4: POPIA & Structure Toggles */}
                    <div className="lfm-flags-panel" style={{ marginTop: 0 }}>
                        <label className="lfm-checkbox-row">
                            <input
                                type="checkbox"
                                checked={popiaEnabled}
                                onChange={e => setPopiaEnabled(e.target.checked)}
                            />
                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                                <span style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    <ShieldCheck size={14} color="var(--mlab-green)" /> POPIA Data Protection Mode (Recommended)
                                </span>
                                <span style={{ fontSize: '0.7rem', color: 'var(--mlab-grey)' }}>
                                    Masks SA ID numbers, phone numbers, and emails. Preserves 100% of demographic and geographic analytics.
                                </span>
                            </div>
                        </label>

                        <label className="lfm-checkbox-row" style={{ marginTop: '8px' }}>
                            <input
                                type="checkbox"
                                checked={includeSummaryTab}
                                onChange={e => setIncludeSummaryTab(e.target.checked)}
                                disabled={fileFormat === 'csv'}
                            />
                            <span style={{ fontWeight: 600 }}>
                                Include Executive & Geographic Summary Sheet (Tab 1)
                            </span>
                        </label>
                    </div>

                    {/* Section 5: File Format */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--mlab-bg)', padding: '10px 14px', border: '1px solid var(--mlab-border)' }}>
                        <span style={{ fontFamily: 'var(--font-heading)', fontSize: '0.75rem', fontWeight: 700, color: 'var(--mlab-blue)', textTransform: 'uppercase' }}>
                            File Format:
                        </span>
                        <div style={{ display: 'flex', gap: '8px' }}>
                            <button
                                type="button"
                                className={`lfm-btn ${fileFormat === 'xlsx' ? 'lfm-btn--primary' : 'lfm-btn--ghost'}`}
                                onClick={() => setFileFormat('xlsx')}
                                style={{ padding: '4px 10px', fontSize: '0.7rem' }}
                            >
                                <FileSpreadsheet size={12} /> Multi-Tab Excel (.xlsx)
                            </button>
                            <button
                                type="button"
                                className={`lfm-btn ${fileFormat === 'csv' ? 'lfm-btn--primary' : 'lfm-btn--ghost'}`}
                                onClick={() => { setFileFormat('csv'); setIncludeSummaryTab(false); }}
                                style={{ padding: '4px 10px', fontSize: '0.7rem' }}
                            >
                                <FileText size={12} /> Single CSV (.csv)
                            </button>
                        </div>
                    </div>

                </div>

                {/* Modal Footer */}
                <div className="lfm-footer">
                    <button type="button" className="lfm-btn lfm-btn--ghost" onClick={onClose}>
                        Cancel
                    </button>
                    <button type="button" className="lfm-btn lfm-btn--primary" onClick={handleExecuteExport}>
                        <DownloadCloud size={14} /> Export {targetCount} Records
                    </button>
                </div>

            </div>
        </div>,
        document.body
    );
};
