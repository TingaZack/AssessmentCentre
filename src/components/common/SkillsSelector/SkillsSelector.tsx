// src/components/common/SkillsSelector/SkillsSelector.tsx

import React, { useState } from 'react';
import { Plus, X, Search, Code, Check } from 'lucide-react';

export interface SkillItem {
    name: string;
    level: 'Beginner' | 'Intermediate' | 'Advanced' | 'Expert';
    category?: string;
}

export const PREDEFINED_SKILLS = [
    // Web & Frontend
    { name: 'JavaScript', category: 'Frontend' },
    { name: 'TypeScript', category: 'Frontend' },
    { name: 'React', category: 'Frontend' },
    { name: 'Next.js', category: 'Frontend' },
    { name: 'Vue.js', category: 'Frontend' },
    { name: 'Angular', category: 'Frontend' },
    { name: 'HTML5 & CSS3', category: 'Frontend' },
    { name: 'Tailwind CSS', category: 'Frontend' },
    { name: 'Redux / Zustand', category: 'Frontend' },

    // Backend & APIs
    { name: 'Node.js', category: 'Backend' },
    { name: 'Express.js', category: 'Backend' },
    { name: 'Python', category: 'Backend' },
    { name: 'Django', category: 'Backend' },
    { name: 'Flask', category: 'Backend' },
    { name: 'Java', category: 'Backend' },
    { name: 'Spring Boot', category: 'Backend' },
    { name: 'C#', category: 'Backend' },
    { name: '.NET Core', category: 'Backend' },
    { name: 'PHP', category: 'Backend' },
    { name: 'Laravel', category: 'Backend' },
    { name: 'Go (Golang)', category: 'Backend' },
    { name: 'RESTful APIs', category: 'Backend' },
    { name: 'GraphQL', category: 'Backend' },

    // Mobile
    { name: 'React Native', category: 'Mobile' },
    { name: 'Flutter', category: 'Mobile' },
    { name: 'Swift (iOS)', category: 'Mobile' },
    { name: 'Kotlin (Android)', category: 'Mobile' },
    { name: 'Expo', category: 'Mobile' },

    // Databases
    { name: 'PostgreSQL', category: 'Database' },
    { name: 'MySQL', category: 'Database' },
    { name: 'MongoDB', category: 'Database' },
    { name: 'Firebase Firestore', category: 'Database' },
    { name: 'Redis', category: 'Database' },
    { name: 'SQLite', category: 'Database' },
    { name: 'MS SQL Server', category: 'Database' },

    // Cloud & DevOps
    { name: 'AWS', category: 'Cloud & DevOps' },
    { name: 'Azure', category: 'Cloud & DevOps' },
    { name: 'Google Cloud (GCP)', category: 'Cloud & DevOps' },
    { name: 'Docker', category: 'Cloud & DevOps' },
    { name: 'Kubernetes', category: 'Cloud & DevOps' },
    { name: 'Git & GitHub', category: 'Cloud & DevOps' },
    { name: 'CI/CD Pipelines', category: 'Cloud & DevOps' },
    { name: 'Linux Administration', category: 'Cloud & DevOps' },

    // Data & AI
    { name: 'Data Analysis', category: 'Data & AI' },
    { name: 'Machine Learning', category: 'Data & AI' },
    { name: 'Pandas & NumPy', category: 'Data & AI' },
    { name: 'Power BI', category: 'Data & AI' },
    { name: 'Tableau', category: 'Data & AI' },
    { name: 'TensorFlow / PyTorch', category: 'Data & AI' },

    // UI/UX & Design
    { name: 'Figma', category: 'UI/UX & Product' },
    { name: 'UI/UX Design', category: 'UI/UX & Product' },
    { name: 'Wireframing & Prototyping', category: 'UI/UX & Product' },
    { name: 'Agile / Scrum', category: 'UI/UX & Product' },

    // QA & Testing
    { name: 'Software Testing (QA)', category: 'Testing' },
    { name: 'Jest / Cypress', category: 'Testing' },
    { name: 'Postman API Testing', category: 'Testing' },
];

const PROFICIENCY_LEVELS: SkillItem['level'][] = ['Beginner', 'Intermediate', 'Advanced', 'Expert'];

const LEVEL_COLORS: Record<SkillItem['level'], { bg: string; text: string; border: string }> = {
    Beginner: { bg: '#f1f5f9', text: '#475569', border: '#cbd5e1' },
    Intermediate: { bg: '#e0f2fe', text: '#0369a1', border: '#bae6fd' },
    Advanced: { bg: '#dcfce7', text: '#15803d', border: '#86efac' },
    Expert: { bg: '#f3e8ff', text: '#6b21a8', border: '#d8b4fe' },
};

interface SkillsSelectorProps {
    value: SkillItem[];
    onChange: (skills: SkillItem[]) => void;
    readOnly?: boolean;
}

export const SkillsSelector: React.FC<SkillsSelectorProps> = ({ value = [], onChange, readOnly = false }) => {
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedCategory, setSelectedCategory] = useState<string>('All');

    const categories = ['All', ...Array.from(new Set(PREDEFINED_SKILLS.map(s => s.category)))];

    const isSelected = (skillName: string) => value.some(s => s.name.toLowerCase() === skillName.toLowerCase());

    const handleAddSkill = (skillName: string, category?: string) => {
        if (!skillName.trim() || isSelected(skillName)) return;
        const newSkill: SkillItem = {
            name: skillName.trim(),
            level: 'Intermediate', // Default level
            category: category || 'Custom'
        };
        onChange([...value, newSkill]);
        setSearchQuery('');
    };

    const handleRemoveSkill = (skillName: string) => {
        onChange(value.filter(s => s.name.toLowerCase() !== skillName.toLowerCase()));
    };

    const handleLevelChange = (skillName: string, level: SkillItem['level']) => {
        onChange(
            value.map(s => (s.name.toLowerCase() === skillName.toLowerCase() ? { ...s, level } : s))
        );
    };

    // Filter predefined skills for suggestion list
    const filteredPredefined = PREDEFINED_SKILLS.filter(s => {
        const matchesCategory = selectedCategory === 'All' || s.category === selectedCategory;
        const matchesSearch = s.name.toLowerCase().includes(searchQuery.toLowerCase());
        return matchesCategory && matchesSearch;
    });

    // Render Read-Only View
    if (readOnly) {
        if (value.length === 0) {
            return <p style={{ fontSize: '0.85rem', color: '#94a3b8', fontStyle: 'italic', margin: 0 }}>No technical skills registered yet.</p>;
        }
        return (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {value.map((skill) => {
                    const colors = LEVEL_COLORS[skill.level] || LEVEL_COLORS.Intermediate;
                    return (
                        <div
                            key={skill.name}
                            style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '6px',
                                background: colors.bg,
                                border: `1px solid ${colors.border}`,
                                padding: '6px 12px',
                                borderRadius: '20px',
                                fontSize: '0.8rem',
                                fontWeight: 600,
                                color: colors.text
                            }}
                        >
                            <span>{skill.name}</span>
                            <span style={{ fontSize: '0.68rem', opacity: 0.8, textTransform: 'uppercase', letterSpacing: '0.04em', background: 'rgba(255,255,255,0.6)', padding: '1px 6px', borderRadius: '10px' }}>
                                {skill.level}
                            </span>
                        </div>
                    );
                })}
            </div>
        );
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {/* 1. SELECTED SKILLS CHIPS & LEVEL ADJUSTERS */}
            <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 700, color: '#334155', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '8px' }}>
                    My Selected Skills ({value.length})
                </label>
                {value.length === 0 ? (
                    <div style={{ padding: '1rem', background: '#f8fafc', border: '1px dashed #cbd5e1', borderRadius: '8px', textAlign: 'center', color: '#64748b', fontSize: '0.85rem' }}>
                        No skills selected yet. Choose from the list below or type your own custom skill.
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                        {value.map((skill) => {
                            const colors = LEVEL_COLORS[skill.level] || LEVEL_COLORS.Intermediate;
                            return (
                                <div
                                    key={skill.name}
                                    style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '8px',
                                        background: colors.bg,
                                        border: `1px solid ${colors.border}`,
                                        padding: '6px 10px 6px 14px',
                                        borderRadius: '20px',
                                        transition: 'all 0.2s ease'
                                    }}
                                >
                                    <span style={{ fontSize: '0.85rem', fontWeight: 700, color: colors.text }}>
                                        {skill.name}
                                    </span>

                                    {/* Level Selector Dropdown */}
                                    <select
                                        value={skill.level}
                                        onChange={(e) => handleLevelChange(skill.name, e.target.value as SkillItem['level'])}
                                        style={{
                                            fontSize: '0.7rem',
                                            fontWeight: 700,
                                            color: colors.text,
                                            background: '#ffffff',
                                            border: `1px solid ${colors.border}`,
                                            borderRadius: '12px',
                                            padding: '2px 6px',
                                            cursor: 'pointer',
                                            outline: 'none'
                                        }}
                                    >
                                        {PROFICIENCY_LEVELS.map(lvl => (
                                            <option key={lvl} value={lvl}>{lvl}</option>
                                        ))}
                                    </select>

                                    {/* Remove Button */}
                                    <button
                                        type="button"
                                        onClick={() => handleRemoveSkill(skill.name)}
                                        style={{
                                            background: 'transparent',
                                            border: 'none',
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            color: colors.text,
                                            opacity: 0.7,
                                            padding: '2px'
                                        }}
                                        title="Remove skill"
                                    >
                                        <X size={14} />
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* 2. SEARCH & CUSTOM SKILL INPUT */}
            <div style={{ display: 'flex', gap: '8px' }}>
                <div style={{ position: 'relative', flex: 1 }}>
                    <Search size={16} color="#94a3b8" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
                    <input
                        type="text"
                        placeholder="Search tech skills or type a custom skill name..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                                e.preventDefault();
                                if (searchQuery.trim()) handleAddSkill(searchQuery);
                            }
                        }}
                        style={{
                            width: '100%',
                            padding: '10px 12px 10px 38px',
                            fontSize: '0.85rem',
                            border: '1px solid #cbd5e1',
                            borderRadius: '8px',
                            background: 'transparent',
                            outline: 'none'
                        }}
                    />
                </div>
                {searchQuery.trim() && !isSelected(searchQuery) && (
                    <button
                        type="button"
                        onClick={() => handleAddSkill(searchQuery)}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            background: 'var(--mlab-blue)',
                            color: 'white',
                            border: 'none',
                            padding: '0 16px',
                            borderRadius: '8px',
                            fontWeight: 700,
                            fontSize: '0.8rem',
                            cursor: 'pointer'
                        }}
                    >
                        <Plus size={14} /> Add Custom
                    </button>
                )}
            </div>

            {/* 3. CATEGORY TABS */}
            <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', paddingBottom: '4px' }}>
                {categories.map(cat => (
                    <button
                        key={cat}
                        type="button"
                        onClick={() => setSelectedCategory(cat)}
                        style={{
                            padding: '4px 12px',
                            fontSize: '0.72rem',
                            fontWeight: 700,
                            borderRadius: '16px',
                            border: `1px solid ${selectedCategory === cat ? 'var(--mlab-blue)' : '#e2e8f0'}`,
                            background: selectedCategory === cat ? 'var(--mlab-light-blue)' : '#f8fafc',
                            color: selectedCategory === cat ? 'var(--mlab-blue)' : '#64748b',
                            cursor: 'pointer',
                            whiteSpace: 'nowrap'
                        }}
                    >
                        {cat}
                    </button>
                ))}
            </div>

            {/* 4. PREDEFINED SKILL CHIPS */}
            <div style={{ maxHeight: '200px', overflowY: 'auto', border: '1px solid #f1f5f9', padding: '10px', borderRadius: '8px', background: '#fafafa' }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {filteredPredefined.map((skill) => {
                        const selected = isSelected(skill.name);
                        return (
                            <button
                                key={skill.name}
                                type="button"
                                onClick={() => selected ? handleRemoveSkill(skill.name) : handleAddSkill(skill.name, skill.category)}
                                style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '4px',
                                    padding: '5px 10px',
                                    borderRadius: '16px',
                                    fontSize: '0.78rem',
                                    fontWeight: selected ? 700 : 500,
                                    border: `1px solid ${selected ? '#22c55e' : '#cbd5e1'}`,
                                    background: selected ? '#f0fdf4' : '#ffffff',
                                    color: selected ? '#15803d' : '#334155',
                                    cursor: 'pointer',
                                    transition: 'all 0.15s ease'
                                }}
                            >
                                {selected ? <Check size={12} color="#15803d" /> : <Plus size={12} color="#94a3b8" />}
                                {skill.name}
                            </button>
                        );
                    })}
                    {filteredPredefined.length === 0 && (
                        <p style={{ fontSize: '0.8rem', color: '#94a3b8', margin: 0, fontStyle: 'italic', padding: '8px' }}>
                            No matching skills found. Click "Add Custom" above to add "{searchQuery}".
                        </p>
                    )}
                </div>
            </div>
        </div>
    );
};