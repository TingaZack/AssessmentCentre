// src/components/common/CourseMetadataSettingsPanel/CourseMetadataSettingsPanel.tsx

import React, { useState, useMemo, useEffect } from 'react';
import ReactQuill from 'react-quill-new';
import 'react-quill-new/dist/quill.snow.css';
import {
    BookOpen, Palette, Image, Clock, Lock, ListChecks, Target, Search, X, Check,
    UserPlus, Users, Loader2
} from 'lucide-react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../../../lib/firebase';
import { ILLUSTRATION_PRESETS } from '../../../constants/illustrationPresets';

const QUILL_MODULES = {
    toolbar: [
        [{ 'header': [1, 2, 3, false] }],
        ['bold', 'italic', 'underline', 'strike', 'blockquote', 'code-block'],
        [{ 'list': 'ordered' }, { 'list': 'bullet' }],
        ['link', 'clean']
    ]
};

// Standard Accrediting Bodies
export const STANDARD_ACCREDITATIONS = [
    { value: 'none', label: 'None (Unaccredited / Short Course)' },
    { value: 'qcto', label: 'QCTO Qualification' },
    { value: 'mict_seta', label: 'MICT SETA Accredited' },
    { value: 'iitpsa', label: 'IITPSA Professional' },
    { value: 'iitpsa_mlab', label: 'IITPSA + mLab Dual Endorsed' },
    { value: 'mlab', label: 'mLab Native Certification' }
];

// Difficulty Levels
export const COURSE_LEVELS = [
    { value: 'beginner', label: '🌱 Beginner' },
    { value: 'intermediate', label: '⚡ Intermediate' },
    { value: 'advanced', label: '🔥 Advanced' },
    { value: 'expert', label: '👑 Expert' },
    { value: 'all_levels', label: '🌐 All Levels Welcome' }
];

// Course Card Color Palette Presets
export const THEME_COLORS = [
    { hex: '#0284c7', label: 'Ocean Blue' },
    { hex: '#059669', label: 'Emerald Green' },
    { hex: '#7c3aed', label: 'Violet Purple' },
    { hex: '#d97706', label: 'Amber Orange' },
    { hex: '#be123c', label: 'Rose Red' },
    { hex: '#0d9488', label: 'Teal' },
    { hex: '#0f172a', label: 'Dark Slate' }
];

// Predefined Recommended Keywords for Chips
export const PREDEFINED_TAGS = [
    'React', 'TypeScript', 'JavaScript', 'Node.js', 'HTML & CSS',
    'APIs & REST', 'Database & SQL', 'Testing & Jest', 'Security',
    'Architecture', 'Git & GitHub', 'DevOps', 'UI/UX Design', 'Python'
];

export interface FacilitatorInfo {
    id?: string;
    name: string;
    role: string;
    email?: string;
    initials: string;
    isManual?: boolean;
}

export interface CourseAttachment {
    id: string;
    name: string;
    url: string;
    fileType: string;
    description: string;
    uploadedAt: string;
    fileSize?: number;
}

interface TagSelectorProps {
    selectedTags: string[];
    onChange: (tags: string[]) => void;
}

export const TagSelector: React.FC<TagSelectorProps> = ({ selectedTags = [], onChange }) => {
    const [searchTerm, setSearchTerm] = useState('');

    const toggleTag = (tag: string) => {
        if (selectedTags.includes(tag)) {
            onChange(selectedTags.filter(t => t !== tag));
        } else {
            onChange([...selectedTags, tag]);
        }
    };

    const addCustomTag = () => {
        const clean = searchTerm.trim();
        if (clean && !selectedTags.includes(clean)) {
            onChange([...selectedTags, clean]);
            setSearchTerm('');
        }
    };

    const filteredPredefined = PREDEFINED_TAGS.filter(tag =>
        tag.toLowerCase().includes(searchTerm.toLowerCase()) && !selectedTags.includes(tag)
    );

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', minHeight: '26px', alignItems: 'center' }}>
                {selectedTags.map(tag => (
                    <span
                        key={tag}
                        style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            background: '#e0f2fe',
                            border: '1px solid #7dd3fc',
                            color: '#0369a1',
                            fontSize: '0.68rem',
                            fontWeight: 700,
                            padding: '2px 6px',
                            borderRadius: '0px'
                        }}
                    >
                        #{tag}
                        <X
                            size={11}
                            style={{ cursor: 'pointer' }}
                            onClick={() => toggleTag(tag)}
                        />
                    </span>
                ))}
                {selectedTags.length === 0 && (
                    <span style={{ fontSize: '0.72rem', color: '#94a3b8', fontStyle: 'italic' }}>
                        No tags assigned
                    </span>
                )}
            </div>

            <div style={{ display: 'flex', gap: '4px' }}>
                <div style={{ position: 'relative', flex: 1, display: 'flex', alignItems: 'center' }}>
                    <Search size={12} style={{ position: 'absolute', left: '8px', color: '#94a3b8' }} />
                    <input
                        className="pfm-input"
                        type="text"
                        style={{ padding: '4px 8px 4px 26px', fontSize: '0.75rem', width: '100%', borderRadius: '0px' }}
                        placeholder="Search tags or type custom..."
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        onKeyDown={e => {
                            if (e.key === 'Enter') {
                                e.preventDefault();
                                addCustomTag();
                            }
                        }}
                    />
                </div>
                {searchTerm && (
                    <button
                        type="button"
                        onClick={addCustomTag}
                        style={{
                            background: '#0284c7',
                            color: 'white',
                            border: 'none',
                            padding: '4px 8px',
                            fontSize: '0.7rem',
                            fontWeight: 700,
                            cursor: 'pointer',
                            borderRadius: '0px'
                        }}
                    >
                        + Add
                    </button>
                )}
            </div>

            {filteredPredefined.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px', marginTop: '2px' }}>
                    {filteredPredefined.slice(0, 6).map(tag => (
                        <button
                            key={tag}
                            type="button"
                            onClick={() => toggleTag(tag)}
                            style={{
                                background: '#ffffff',
                                border: '1px solid #cbd5e1',
                                color: '#475569',
                                fontSize: '0.65rem',
                                padding: '2px 5px',
                                borderRadius: '0px',
                                cursor: 'pointer',
                                fontWeight: 600,
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '2px'
                            }}
                        >
                            + {tag}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
};

interface DynamicListEditorProps {
    items: string[];
    placeholder: string;
    buttonLabel: string;
    onChange: (newItems: string[]) => void;
}

export const DynamicListEditor: React.FC<DynamicListEditorProps> = ({ items = [], placeholder, buttonLabel, onChange }) => {
    const [inputValue, setInputValue] = useState('');

    const handleAdd = () => {
        const clean = inputValue.trim();
        if (clean) {
            onChange([...items, clean]);
            setInputValue('');
        }
    };

    const handleRemove = (index: number) => {
        onChange(items.filter((_, i) => i !== index));
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <div style={{ display: 'flex', gap: '4px' }}>
                <input
                    className="pfm-input"
                    style={{ flex: 1, padding: '4px 8px', fontSize: '0.75rem', borderRadius: '0px' }}
                    placeholder={placeholder}
                    value={inputValue}
                    onChange={e => setInputValue(e.target.value)}
                    onKeyDown={e => {
                        if (e.key === 'Enter') {
                            e.preventDefault();
                            handleAdd();
                        }
                    }}
                />
                <button
                    type="button"
                    onClick={handleAdd}
                    style={{ background: '#0284c7', color: 'white', border: 'none', padding: '4px 8px', fontSize: '0.7rem', fontWeight: 700, cursor: 'pointer', borderRadius: '0px' }}
                >
                    {buttonLabel}
                </button>
            </div>

            {items.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    {items.map((item, idx) => (
                        <div key={idx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'white', border: '1px solid #cbd5e1', padding: '4px 8px', fontSize: '0.72rem', color: '#0f172a' }}>
                            <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <span style={{ fontWeight: 800, color: '#0284c7' }}>•</span> {item}
                            </span>
                            <X size={12} style={{ cursor: 'pointer', color: '#ef4444' }} onClick={() => handleRemove(idx)} />
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export interface CourseMetadataSettingsPanelProps {
    illustrationType: string;
    setIllustrationType: (val: string) => void;
    themeColor: string;
    setThemeColor: (val: string) => void;
    courseLevel: string;
    setCourseLevel: (val: string) => void;
    courseDescription: string;
    setCourseDescription: (val: string) => void;
    prerequisites: string[];
    setPrerequisites: (val: string[]) => void;
    learningOutcomes: string[];
    setLearningOutcomes: (val: string[]) => void;
    targetAudience: string[];
    setTargetAudience: (val: string[]) => void;
    materialIncludes?: string[];
    setMaterialIncludes?: (val: string[]) => void;
    isCertificateAwarded: boolean;
    setIsCertificateAwarded: (val: boolean) => void;
    courseTags: string[];
    setCourseTags: (val: string[]) => void;
    instructors?: FacilitatorInfo[];
    setInstructors?: (val: FacilitatorInfo[]) => void;
    containerId?: string;
    totalContentHours: number;
    courseworkHours: number;
    setCourseworkHours: (val: number) => void;
    grandTotalHours: number;
    isAccredited: boolean;
    setIsAccredited: (val: boolean) => void;
    accreditationBody: string;
    setAccreditationBody: (val: string) => void;
    customAccreditationText: string;
    setCustomAccreditationText: (val: string) => void;
    saqaId: string;
    setSaqaId: (val: string) => void;
    nqfLevel: string | number;
    setNqfLevel: (val: string | number) => void;
    credits: number;
    setCredits: (val: number) => void;
    onSyncTagsFromLessons?: () => void;
}

export const CourseMetadataSettingsPanel: React.FC<CourseMetadataSettingsPanelProps> = ({
    illustrationType,
    setIllustrationType,
    themeColor,
    setThemeColor,
    courseLevel,
    setCourseLevel,
    courseDescription,
    setCourseDescription,
    prerequisites,
    setPrerequisites,
    learningOutcomes,
    setLearningOutcomes,
    targetAudience,
    setTargetAudience,
    materialIncludes = [],
    setMaterialIncludes,
    isCertificateAwarded,
    setIsCertificateAwarded,
    courseTags,
    setCourseTags,
    instructors = [
        { name: 'mLab Facilitator Team', role: 'Lead Technical Instructor', initials: 'ML' }
    ],
    setInstructors,
    totalContentHours,
    courseworkHours,
    setCourseworkHours,
    grandTotalHours,
    isAccredited,
    setIsAccredited,
    accreditationBody,
    setAccreditationBody,
    customAccreditationText,
    setCustomAccreditationText,
    saqaId,
    setSaqaId,
    nqfLevel,
    setNqfLevel,
    credits,
    setCredits,
    onSyncTagsFromLessons
}) => {
    const [illustrationSearch, setIllustrationSearch] = useState('');

    // Registered Facilitators State (from Firestore)
    const [registeredFacilitators, setRegisteredFacilitators] = useState<FacilitatorInfo[]>([]);
    const [isLoadingFacilitators, setIsLoadingLoadingFacilitators] = useState<boolean>(false);
    const [isManualFacilitatorMode, setIsManualFacilitatorMode] = useState<boolean>(false);
    const [manualName, setManualName] = useState('');
    const [manualRole, setManualRole] = useState('Guest Facilitator');

    // Fetch registered facilitators from Firestore
    useEffect(() => {
        const fetchFacilitators = async () => {
            setIsLoadingLoadingFacilitators(true);
            try {
                const usersRef = collection(db, 'users');
                const q = query(usersRef, where('role', 'in', ['admin', 'facilitator', 'staff', 'instructor']));
                const querySnap = await getDocs(q);

                const fetched: FacilitatorInfo[] = [];
                querySnap.forEach(docSnap => {
                    const d = docSnap.data();
                    const name = d.displayName || d.fullName || `${d.firstName || ''} ${d.lastName || ''}`.trim() || d.email || 'Facilitator';
                    const initials = name.split(' ').map((n: string) => n[0]).join('').substring(0, 2).toUpperCase() || 'FC';
                    fetched.push({
                        id: docSnap.id,
                        name,
                        role: d.roleTitle || (d.role === 'admin' ? 'Lead Administrator' : 'Technical Facilitator'),
                        email: d.email,
                        initials,
                        isManual: false
                    });
                });

                setRegisteredFacilitators(fetched);
            } catch (err) {
                console.warn('[FacilitatorFetch] Could not query Firestore users:', err);
            } finally {
                setIsLoadingLoadingFacilitators(false);
            }
        };

        fetchFacilitators();
    }, []);

    const handleSelectRegisteredFacilitator = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const val = e.target.value;
        if (val === 'manual') {
            setIsManualFacilitatorMode(true);
            return;
        }
        setIsManualFacilitatorMode(false);

        const found = registeredFacilitators.find(f => f.id === val);
        if (found && setInstructors) {
            const alreadyAssigned = instructors.some(i => i.id === found.id || i.name === found.name);
            if (!alreadyAssigned) {
                setInstructors([...instructors, found]);
            }
        }
    };

    const handleAddManualFacilitator = () => {
        const cleanName = manualName.trim();
        if (!cleanName || !setInstructors) return;

        const initials = cleanName.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() || 'FC';
        const newFacilitator: FacilitatorInfo = {
            name: cleanName,
            role: manualRole.trim() || 'Guest Facilitator',
            initials,
            isManual: true
        };

        setInstructors([...instructors, newFacilitator]);
        setManualName('');
        setManualRole('Guest Facilitator');
        setIsManualFacilitatorMode(false);
    };

    const handleRemoveFacilitator = (index: number) => {
        if (!setInstructors) return;
        setInstructors(instructors.filter((_, i) => i !== index));
    };

    const filteredIllustrations = useMemo(() => {
        if (!illustrationSearch.trim()) return ILLUSTRATION_PRESETS;
        const q = illustrationSearch.toLowerCase().trim();
        return ILLUSTRATION_PRESETS.filter(item =>
            item.title.toLowerCase().includes(q) || item.tags.some(t => t.includes(q))
        );
    }, [illustrationSearch]);

    return (
        <div style={{ overflowY: 'auto', minHeight: 0, padding: '16px', background: '#1e293b', color: 'white', borderRight: '1px solid #334155', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', fontWeight: 800, color: '#38bdf8', borderBottom: '1px solid #334155', paddingBottom: '8px' }}>
                <BookOpen size={16} /> Course Overview &amp; Hub Details
            </div>

            {/* REGISTERED FACILITATORS & MANUAL INSTRUCTOR ASSIGNMENT */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', background: '#0f172a', padding: '12px', border: '1px solid #334155' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <label style={{ fontSize: '0.72rem', fontWeight: 800, color: '#38bdf8', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <Users size={13} /> Assigned Course Facilitators ({instructors.length}):
                    </label>
                    {isLoadingFacilitators && <Loader2 size={12} className="pfm-spin" style={{ color: '#38bdf8' }} />}
                </div>

                {/* Assigned List Badges */}
                {instructors.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        {instructors.map((inst, idx) => (
                            <div key={inst.id || idx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#1e293b', border: '1px solid #334155', padding: '6px 8px', fontSize: '0.72rem' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <div style={{ width: '22px', height: '22px', background: '#0284c7', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '0.62rem', fontFamily: 'var(--font-heading)' }}>
                                        {inst.initials}
                                    </div>
                                    <div>
                                        <div style={{ fontWeight: 800, color: '#f8fafc' }}>{inst.name} {inst.isManual && <span style={{ color: '#fbbf24', fontSize: '0.6rem' }}>(Guest)</span>}</div>
                                        <div style={{ fontSize: '0.62rem', color: '#94a3b8' }}>{inst.role}</div>
                                    </div>
                                </div>
                                {instructors.length > 1 && (
                                    <span
                                        title="Remove Facilitator"
                                        style={{ cursor: 'pointer', color: '#ef4444', display: 'inline-flex', alignItems: 'center' }}
                                        onClick={() => handleRemoveFacilitator(idx)}
                                    >
                                        <X size={12} />
                                    </span>
                                )}
                            </div>
                        ))}
                    </div>
                )}

                {/* Dropdown or Manual Selector */}
                {!isManualFacilitatorMode ? (
                    <select
                        value=""
                        onChange={handleSelectRegisteredFacilitator}
                        style={{ background: '#1e293b', color: 'white', border: '1px solid #38bdf8', padding: '5px 8px', fontWeight: 700, fontSize: '0.72rem', borderRadius: '0px', width: '100%', cursor: 'pointer' }}
                    >
                        <option value="" disabled>+ Add Facilitator from System Registry...</option>
                        {registeredFacilitators.map(f => (
                            <option key={f.id} value={f.id}>{f.name} ({f.role})</option>
                        ))}
                        <option value="manual">✏️ + Enter External / Guest Facilitator Manually...</option>
                    </select>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', background: '#1e293b', padding: '8px', border: '1px solid #38bdf8' }}>
                        <div style={{ fontSize: '0.68rem', fontWeight: 800, color: '#fbbf24', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <UserPlus size={12} /> Add External / Guest Facilitator
                        </div>
                        <input
                            className="pfm-input"
                            type="text"
                            placeholder="Full Name (e.g. Dr. Sarah Jenkins)"
                            value={manualName}
                            onChange={e => setManualName(e.target.value)}
                            style={{ padding: '4px 6px', fontSize: '0.72rem', background: '#0f172a', color: 'white', border: '1px solid #334155', borderRadius: '0px' }}
                        />
                        <input
                            className="pfm-input"
                            type="text"
                            placeholder="Role Title (e.g. Guest Industry Specialist)"
                            value={manualRole}
                            onChange={e => setManualRole(e.target.value)}
                            style={{ padding: '4px 6px', fontSize: '0.72rem', background: '#0f172a', color: 'white', border: '1px solid #334155', borderRadius: '0px' }}
                        />
                        <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end', marginTop: '2px' }}>
                            <button
                                type="button"
                                onClick={() => setIsManualFacilitatorMode(false)}
                                style={{ background: 'transparent', color: '#94a3b8', border: 'none', fontSize: '0.68rem', cursor: 'pointer' }}
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={handleAddManualFacilitator}
                                style={{ background: '#0284c7', color: 'white', border: 'none', padding: '3px 10px', fontSize: '0.7rem', fontWeight: 800, cursor: 'pointer', borderRadius: '0px' }}
                            >
                                Assign Facilitator
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* VISUAL BRANDING: CARD COLOR PALETTE & ILLUSTRATION LIBRARY */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', background: '#0f172a', padding: '12px', border: '1px solid #334155' }}>
                <label style={{ fontSize: '0.72rem', fontWeight: 800, color: '#38bdf8', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Palette size={13} /> Card Theme Color Accent:
                </label>

                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    {THEME_COLORS.map(c => (
                        <button
                            key={c.hex}
                            type="button"
                            onClick={() => setThemeColor(c.hex)}
                            style={{
                                width: '24px',
                                height: '24px',
                                backgroundColor: c.hex,
                                border: themeColor === c.hex ? '2px solid white' : '1px solid #334155',
                                cursor: 'pointer',
                                outline: themeColor === c.hex ? '2px solid #38bdf8' : 'none'
                            }}
                            title={c.label}
                        />
                    ))}
                </div>

                <label style={{ fontSize: '0.72rem', fontWeight: 800, color: '#38bdf8', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '4px', marginTop: '6px' }}>
                    <Image size={13} /> Course Graphic Artwork:
                </label>

                {/* Searchable Illustration Selector */}
                <div style={{ position: 'relative' }}>
                    <Search size={12} style={{ position: 'absolute', left: '8px', top: '8px', color: '#94a3b8' }} />
                    <input
                        className="pfm-input"
                        type="text"
                        style={{ padding: '4px 8px 4px 26px', fontSize: '0.72rem', background: '#1e293b', color: 'white', border: '1px solid #334155', width: '100%', borderRadius: '0px' }}
                        placeholder="Search graphic icon presets..."
                        value={illustrationSearch}
                        onChange={e => setIllustrationSearch(e.target.value)}
                    />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px', maxHeight: '140px', overflowY: 'auto', background: '#1e293b', padding: '6px', border: '1px solid #334155' }}>
                    {filteredIllustrations.map(preset => {
                        const IconComp = preset.icon;
                        const isSelected = illustrationType === preset.id;
                        return (
                            <button
                                key={preset.id}
                                type="button"
                                onClick={() => setIllustrationType(preset.id)}
                                style={{
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    padding: '8px 4px',
                                    background: isSelected ? themeColor : '#0f172a',
                                    color: 'white',
                                    border: `1px solid ${isSelected ? '#38bdf8' : '#334155'}`,
                                    cursor: 'pointer'
                                }}
                                title={preset.title}
                            >
                                <IconComp size={18} />
                                <span style={{ fontSize: '0.58rem', marginTop: '4px', textAlign: 'center', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' }}>
                                    {preset.id}
                                </span>
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* WORKLOAD TIME BREAKDOWN CONTROL */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', background: '#0f172a', padding: '12px', border: '1px solid #334155' }}>
                <label style={{ fontSize: '0.72rem', fontWeight: 800, color: '#38bdf8', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Clock size={13} /> Workload Time Breakdown:
                </label>

                <div style={{ fontSize: '0.72rem', color: '#cbd5e1', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>Lesson Runtimes (Auto-Calculated):</span>
                    <strong style={{ color: '#ffffff' }}>~{totalContentHours} Hours</strong>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginTop: '2px' }}>
                    <label style={{ fontSize: '0.7rem', color: '#94a3b8' }}>
                        Projects / Quizzes / Labs (Manual):
                    </label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <input
                            type="number"
                            min="0"
                            step="0.5"
                            value={courseworkHours}
                            onChange={e => setCourseworkHours(parseFloat(e.target.value) || 0)}
                            style={{ width: '55px', padding: '3px 6px', fontSize: '0.75rem', fontWeight: 700, background: '#1e293b', color: 'white', border: '1px solid #38bdf8', textAlign: 'center', borderRadius: '0px' }}
                        />
                        <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>Hours</span>
                    </div>
                </div>

                <div style={{ background: '#1e293b', padding: '6px 8px', border: '1px solid #0284c7', fontSize: '0.72rem', color: '#38bdf8', fontWeight: 700, textAlign: 'center', marginTop: '4px' }}>
                    ⏱️ Total: {grandTotalHours}h ({totalContentHours}h lessons + {courseworkHours}h projects)
                </div>
            </div>

            {/* Difficulty Level & Certificate */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', background: '#0f172a', padding: '12px', border: '1px solid #334155' }}>
                <label style={{ fontSize: '0.72rem', fontWeight: 800, color: '#38bdf8', textTransform: 'uppercase' }}>
                    Course Difficulty Level:
                </label>
                <select
                    value={courseLevel}
                    onChange={e => setCourseLevel(e.target.value)}
                    style={{ padding: '4px 8px', fontSize: '0.75rem', fontWeight: 700, background: '#1e293b', color: 'white', border: '1px solid #38bdf8', borderRadius: '0px', width: '100%' }}
                >
                    {COURSE_LEVELS.map(lvl => (
                        <option key={lvl.value} value={lvl.value}>{lvl.label}</option>
                    ))}
                </select>

                <label style={{ fontSize: '0.72rem', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', color: '#f8fafc', fontWeight: 700, marginTop: '4px' }}>
                    <input
                        type="checkbox"
                        checked={isCertificateAwarded}
                        onChange={e => setIsCertificateAwarded(e.target.checked)}
                        style={{ accentColor: '#059669' }}
                    />
                    Award Certificate on Completion
                </label>
            </div>

            {/* Course Description with ReactQuill Rich Text */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '0.72rem', fontWeight: 800, color: '#38bdf8', textTransform: 'uppercase' }}>
                    Summary Description (For Hub Card):
                </label>
                <div style={{ background: 'white', border: '1px solid #334155', color: '#0f172a' }}>
                    <ReactQuill
                        theme="snow"
                        value={courseDescription || ''}
                        onChange={(val) => setCourseDescription(val)}
                        modules={QUILL_MODULES}
                    />
                </div>
            </div>

            {/* Accreditation Panel */}
            <div style={{ background: '#0f172a', border: isAccredited ? '1px solid #0284c7' : '1px solid #334155', padding: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>
                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontWeight: 800, fontSize: '0.72rem', cursor: 'pointer', color: '#38bdf8', textTransform: 'uppercase' }}>
                        <input
                            type="checkbox"
                            checked={isAccredited}
                            onChange={e => {
                                const checked = e.target.checked;
                                setIsAccredited(checked);
                                if (!checked) {
                                    setAccreditationBody('none');
                                } else if (accreditationBody === 'none') {
                                    setAccreditationBody('qcto');
                                }
                            }}
                            style={{ accentColor: '#38bdf8', cursor: 'pointer' }}
                        />
                        Course Has Formal Accreditation
                    </label>
                </div>

                {isAccredited ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '4px' }}>
                        <select
                            value={accreditationBody}
                            onChange={e => {
                                const val = e.target.value;
                                setAccreditationBody(val);
                                if (val === 'none') {
                                    setIsAccredited(false);
                                }
                            }}
                            style={{ background: '#1e293b', color: 'white', border: '1px solid #38bdf8', padding: '4px 6px', fontWeight: 700, fontSize: '0.72rem', borderRadius: '0px', width: '100%' }}
                        >
                            {STANDARD_ACCREDITATIONS.map(acc => (
                                <option key={acc.value} value={acc.value}>{acc.label}</option>
                            ))}
                            <option value="other">Other Custom Body...</option>
                        </select>

                        {accreditationBody === 'other' && (
                            <input
                                className="pfm-input"
                                type="text"
                                placeholder="e.g. AWS Certified..."
                                value={customAccreditationText}
                                onChange={e => setCustomAccreditationText(e.target.value)}
                                style={{ padding: '4px 6px', fontSize: '0.72rem', fontWeight: 700, background: '#1e293b', color: 'white', border: '1px solid #334155', borderRadius: '0px' }}
                            />
                        )}

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '4px', marginTop: '2px' }}>
                            <div>
                                <label style={{ fontSize: '0.62rem', color: '#94a3b8', display: 'block' }}>SAQA ID:</label>
                                <input
                                    type="text"
                                    placeholder="115790"
                                    value={saqaId}
                                    onChange={e => setSaqaId(e.target.value)}
                                    style={{ width: '100%', padding: '2px 4px', fontSize: '0.72rem', fontWeight: 700, background: '#1e293b', color: 'white', border: '1px solid #334155', borderRadius: '0px' }}
                                />
                            </div>
                            <div>
                                <label style={{ fontSize: '0.62rem', color: '#94a3b8', display: 'block' }}>NQF Level:</label>
                                <input
                                    type="number"
                                    placeholder="5"
                                    value={nqfLevel}
                                    onChange={e => setNqfLevel(e.target.value)}
                                    style={{ width: '100%', padding: '2px 4px', fontSize: '0.72rem', fontWeight: 700, background: '#1e293b', color: 'white', border: '1px solid #334155', borderRadius: '0px', textAlign: 'center' }}
                                />
                            </div>
                            <div>
                                <label style={{ fontSize: '0.62rem', color: '#94a3b8', display: 'block' }}>Credits:</label>
                                <input
                                    type="number"
                                    placeholder="120"
                                    value={credits}
                                    onChange={e => setCredits(parseInt(e.target.value) || 0)}
                                    style={{ width: '100%', padding: '2px 4px', fontSize: '0.72rem', fontWeight: 700, background: '#1e293b', color: 'white', border: '1px solid #334155', borderRadius: '0px', textAlign: 'center' }}
                                />
                            </div>
                        </div>
                    </div>
                ) : (
                    <span style={{ fontSize: '0.68rem', color: '#94a3b8', fontStyle: 'italic' }}>
                        Unaccredited / Short Skill Course
                    </span>
                )}
            </div>

            {/* Overall Course Tags */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <label style={{ fontSize: '0.72rem', fontWeight: 800, color: '#38bdf8', textTransform: 'uppercase' }}>
                        Overall Course Tags:
                    </label>
                    {onSyncTagsFromLessons && (
                        <button
                            type="button"
                            onClick={onSyncTagsFromLessons}
                            style={{ background: 'transparent', border: 'none', color: '#38bdf8', fontSize: '0.68rem', fontWeight: 700, cursor: 'pointer', padding: 0 }}
                        >
                            ✨ Sync From Lessons
                        </button>
                    )}
                </div>

                <TagSelector
                    selectedTags={courseTags}
                    onChange={newTags => setCourseTags(newTags)}
                />
            </div>

            {/* What You Will Learn (Outcomes) */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '0.72rem', fontWeight: 800, color: '#38bdf8', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <ListChecks size={13} /> What You Will Learn (Outcomes):
                </label>
                <DynamicListEditor
                    items={learningOutcomes}
                    placeholder="e.g. Build React component trees..."
                    buttonLabel="+ Outcome"
                    onChange={newList => setLearningOutcomes(newList)}
                />
            </div>

            {/* Prerequisites */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '0.72rem', fontWeight: 800, color: '#38bdf8', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Lock size={13} /> Course Prerequisites:
                </label>
                <DynamicListEditor
                    items={prerequisites}
                    placeholder="e.g. Basic HTML/CSS knowledge..."
                    buttonLabel="+ Req"
                    onChange={newList => setPrerequisites(newList)}
                />
            </div>

            {/* Target Audience */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '0.72rem', fontWeight: 800, color: '#38bdf8', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Target size={13} /> Target Audience:
                </label>
                <DynamicListEditor
                    items={targetAudience}
                    placeholder="e.g. Aspiring Full-Stack Developers..."
                    buttonLabel="+ Audience"
                    onChange={newList => setTargetAudience(newList)}
                />
            </div>

            {/* Material Included */}
            {setMaterialIncludes && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '0.72rem', fontWeight: 800, color: '#38bdf8', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <Check size={13} /> Material Included:
                    </label>
                    <DynamicListEditor
                        items={materialIncludes}
                        placeholder="e.g. Downloadable lab guides & assets..."
                        buttonLabel="+ Item"
                        onChange={newList => setMaterialIncludes(newList)}
                    />
                </div>
            )}
        </div>
    );
};