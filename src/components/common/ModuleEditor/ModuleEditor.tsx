// src/components/common/ModuleEditor.tsx

import React from 'react';
import { Trash2, Plus } from 'lucide-react';
import type { ModuleCategory } from '../../../types';
import './ModuleEditor.css';

interface ModuleEditorProps {
    modules: any[];
    type: ModuleCategory;
    onUpdate: (index: number, field: string, value: string | number) => void;
    onRemove: (index: number) => void;
    onAdd: () => void;
    isTemplate?: boolean;
}

const normalizeStatus = (status?: string) => {
    if (!status) return "Not Started";
    const s = status.toLowerCase().trim();
    if (s === "competent" || s === "pass" || s === "c") return "Competent";
    if (s === "not yet competent" || s === "not competent" || s === "fail" || s === "nyc") return "Not Yet Competent";
    if (s === "not started") return "Not Started";
    return "In Progress";
};

export const ModuleEditor: React.FC<ModuleEditorProps> = ({
    modules, type, onUpdate, onRemove, onAdd, isTemplate = false,
}) => {
    // Determine correct field name based on category
    const dateField = type === 'workExperience' ? 'dateSignedOff' : 'dateAssessed';

    return (
        <div className="me-wrap">
            <div className="me-table-scroll">
                <table className="me-table">
                    <thead>
                        <tr>
                            <th className="me-th me-th--name">Module Name</th>
                            <th className="me-th me-th--narrow">NQF</th>
                            <th className="me-th me-th--narrow">Credits</th>
                            {!isTemplate && (
                                <th className="me-th me-th--date">
                                    {type === 'workExperience' ? 'Date Signed Off' : 'Date Assessed'}
                                </th>
                            )}
                            {!isTemplate && <th className="me-th me-th--status">Status</th>}
                            <th className="me-th me-th--action" />
                        </tr>
                    </thead>
                    <tbody>
                        {modules.length === 0 && (
                            <tr>
                                <td className="me-empty" colSpan={isTemplate ? 4 : 6}>
                                    No modules added yet.
                                </td>
                            </tr>
                        )}
                        {modules.map((m, i) => (
                            <tr key={i} className="me-row">
                                <td className="me-td">
                                    <input
                                        className="me-input"
                                        type="text"
                                        value={m.name}
                                        onChange={e => onUpdate(i, 'name', e.target.value)}
                                        placeholder="Module name"
                                    />
                                </td>
                                <td className="me-td">
                                    <input
                                        className="me-input me-input--num"
                                        type="number"
                                        value={m.nqfLevel}
                                        onChange={e => onUpdate(i, 'nqfLevel', parseInt(e.target.value) || 0)}
                                    />
                                </td>
                                <td className="me-td">
                                    <input
                                        className="me-input me-input--num"
                                        type="number"
                                        value={m.credits}
                                        onChange={e => onUpdate(i, 'credits', parseInt(e.target.value) || 0)}
                                    />
                                </td>
                                {!isTemplate && (
                                    <>
                                        <td className="me-td">
                                            <input
                                                className="me-input"
                                                type="date"
                                                value={m[dateField] || ''}
                                                onChange={e => onUpdate(i, dateField, e.target.value)}
                                            />
                                        </td>
                                        <td className="me-td">
                                            <select
                                                className="me-select"
                                                value={normalizeStatus(m.status)}
                                                onChange={e => onUpdate(i, 'status', e.target.value)}
                                            >
                                                <option value="Competent">Competent</option>
                                                <option value="Not Yet Competent">Not Yet Competent</option>
                                                <option value="In Progress">In Progress</option>
                                                <option value="Not Started">Not Started</option>
                                            </select>
                                        </td>
                                    </>
                                )}
                                <td className="me-td me-td--action">
                                    <button
                                        type="button"
                                        className="me-remove-btn"
                                        onClick={() => onRemove(i)}
                                        title="Remove module"
                                    >
                                        <Trash2 size={15} />
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <button type="button" className="me-add-btn" onClick={onAdd}>
                <Plus size={14} /> Add Module
            </button>
        </div>
    );
};


// import React from 'react';
// import { Trash2, Plus } from 'lucide-react';
// import type { ModuleCategory } from '../../../types';
// import './ModuleEditor.css';

// interface ModuleEditorProps {
//     modules: any[];
//     type: ModuleCategory;
//     onUpdate: (index: number, field: string, value: string | number) => void;
//     onRemove: (index: number) => void;
//     onAdd: () => void;
//     isTemplate?: boolean;
// }

// export const ModuleEditor: React.FC<ModuleEditorProps> = ({
//     modules, type, onUpdate, onRemove, onAdd, isTemplate = false,
// }) => (
//     <div className="me-wrap">
//         <div className="me-table-scroll">
//             <table className="me-table">
//                 <thead>
//                     <tr>
//                         <th className="me-th me-th--name">Module Name</th>
//                         <th className="me-th me-th--narrow">NQF</th>
//                         <th className="me-th me-th--narrow">Credits</th>
//                         {!isTemplate && (
//                             <th className="me-th me-th--date">
//                                 {type === 'workExperience' ? 'Date Signed Off' : 'Date Assessed'}
//                             </th>
//                         )}
//                         {!isTemplate && <th className="me-th me-th--status">Status</th>}
//                         <th className="me-th me-th--action" />
//                     </tr>
//                 </thead>
//                 <tbody>
//                     {modules.length === 0 && (
//                         <tr>
//                             <td
//                                 className="me-empty"
//                                 colSpan={isTemplate ? 4 : 6}
//                             >
//                                 No modules added yet.
//                             </td>
//                         </tr>
//                     )}
//                     {modules.map((m, i) => (
//                         <tr key={i} className="me-row">
//                             <td className="me-td">
//                                 <input
//                                     className="me-input"
//                                     type="text"
//                                     value={m.name}
//                                     onChange={e => onUpdate(i, 'name', e.target.value)}
//                                     placeholder="Module name"
//                                 />
//                             </td>
//                             <td className="me-td">
//                                 <input
//                                     className="me-input me-input--num"
//                                     type="number"
//                                     value={m.nqfLevel}
//                                     onChange={e => onUpdate(i, 'nqfLevel', parseInt(e.target.value) || 0)}
//                                 />
//                             </td>
//                             <td className="me-td">
//                                 <input
//                                     className="me-input me-input--num"
//                                     type="number"
//                                     value={m.credits}
//                                     onChange={e => onUpdate(i, 'credits', parseInt(e.target.value) || 0)}
//                                 />
//                             </td>
//                             {!isTemplate && (
//                                 <>
//                                     <td className="me-td">
//                                         <input
//                                             className="me-input"
//                                             type="date"
//                                             value={m.dateAssessed || m.dateSignedOff || ''}
//                                             onChange={e =>
//                                                 onUpdate(
//                                                     i,
//                                                     type === 'workExperience' ? 'dateSignedOff' : 'dateAssessed',
//                                                     e.target.value
//                                                 )
//                                             }
//                                         />
//                                     </td>
//                                     <td className="me-td">
//                                         <select
//                                             className="me-select"
//                                             value={m.status}
//                                             onChange={e => onUpdate(i, 'status', e.target.value)}
//                                         >
//                                             {type === 'practical' ? (
//                                                 <>
//                                                     <option value="Pass">Competent</option>
//                                                     <option value="Fail">Not Yet Competent</option>
//                                                 </>
//                                             ) : (
//                                                 <>
//                                                     <option value="Competent">Competent</option>
//                                                     <option value="Not Competent">Not Yet Competent</option>
//                                                 </>
//                                             )}
//                                         </select>
//                                     </td>
//                                 </>
//                             )}
//                             <td className="me-td me-td--action">
//                                 <button
//                                     type="button"
//                                     className="me-remove-btn"
//                                     onClick={() => onRemove(i)}
//                                     title="Remove module"
//                                 >
//                                     <Trash2 size={15} />
//                                 </button>
//                             </td>
//                         </tr>
//                     ))}
//                 </tbody>
//             </table>
//         </div>

//         <button type="button" className="me-add-btn" onClick={onAdd}>
//             <Plus size={14} /> Add Module
//         </button>
//     </div>
// );

