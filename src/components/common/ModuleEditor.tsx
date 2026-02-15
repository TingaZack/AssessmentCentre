import React from 'react';
import { Trash2, Plus } from 'lucide-react';
import type { ModuleCategory } from '../../types';

interface ModuleEditorProps {
    modules: any[]; // could be more strictly typed
    type: ModuleCategory;
    onUpdate: (index: number, field: string, value: string | number) => void;
    onRemove: (index: number) => void;
    onAdd: () => void;
    isTemplate?: boolean;
}

export const ModuleEditor: React.FC<ModuleEditorProps> = ({
    modules,
    type,
    onUpdate,
    onRemove,
    onAdd,
    isTemplate = false,
}) => (
    <div style={{ width: '100%', overflowX: 'auto' }}>
        <table className="assessment-table" style={{ marginBottom: '1rem', minWidth: '700px' }}>
            <thead>
                <tr>
                    <th>Module Name</th>
                    <th style={{ width: 80 }}>NQF</th>
                    <th style={{ width: 80 }}>Credits</th>
                    <th style={{ width: 100, display: 'none' }}>Notional Hrs</th>
                    {!isTemplate && (
                        <th style={{ width: 160 }}>{type === 'workExperience' ? 'Date Signed Off' : 'Date Assessed'}</th>
                    )}
                    {!isTemplate && <th style={{ width: 150 }}>Status</th>}
                    <th style={{ width: 50 }}></th>
                </tr>
            </thead>
            <tbody>
                {modules.map((m, i) => (
                    <tr key={i}>
                        <td>
                            <input
                                type="text"
                                value={m.name}
                                onChange={(e) => onUpdate(i, 'name', e.target.value)}
                                style={{ width: '100%' }}
                            />
                        </td>
                        <td>
                            <input
                                type="number"
                                value={m.nqfLevel}
                                onChange={(e) => onUpdate(i, 'nqfLevel', parseInt(e.target.value) || 0)}
                                style={{ width: '100%' }}
                            />
                        </td>
                        <td>
                            <input
                                type="number"
                                value={m.credits}
                                onChange={(e) => onUpdate(i, 'credits', parseInt(e.target.value) || 0)}
                                style={{ width: '100%' }}
                            />
                        </td>
                        <td style={{ display: 'none' }}>
                            <input
                                type="number"
                                value={m.notionalHours}
                                onChange={(e) => onUpdate(i, 'notionalHours', parseInt(e.target.value) || 0)}
                                style={{ width: '100%', border: '1px solid #94c73d' }}
                            />
                        </td>
                        {!isTemplate && (
                            <>
                                <td>
                                    <input
                                        type="date"
                                        value={m.dateAssessed || m.dateSignedOff || ''}
                                        onChange={(e) =>
                                            onUpdate(
                                                i,
                                                type === 'workExperience' ? 'dateSignedOff' : 'dateAssessed',
                                                e.target.value
                                            )
                                        }
                                        style={{ width: '100%' }}
                                    />
                                </td>
                                <td>
                                    <select
                                        value={m.status}
                                        onChange={(e) => onUpdate(i, 'status', e.target.value)}
                                        style={{ width: '100%' }}
                                    >
                                        {type === 'practical' ? (
                                            <>
                                                <option value="Pass">Competent</option>
                                                <option value="Fail">Not Yet Competent</option>
                                            </>
                                        ) : (
                                            <>
                                                <option value="Competent">Competent</option>
                                                <option value="Not Competent">Not Yet Competent</option>
                                            </>
                                        )}
                                    </select>
                                </td>
                            </>
                        )}
                        <td style={{ textAlign: 'center' }}>
                            <button type="button" className="icon-btn delete" onClick={() => onRemove(i)}>
                                <Trash2 size={18} />
                            </button>
                        </td>
                    </tr>
                ))}
            </tbody>
        </table>
        <button type="button" className="add-module-btn" onClick={onAdd}>
            <Plus size={18} /> Add Module
        </button>
    </div>
);