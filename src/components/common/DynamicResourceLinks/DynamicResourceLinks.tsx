// src/components/common/DynamicResourceLinks/DynamicResourceLinks.tsx

import React, { useState } from 'react';
import {
    Globe, Github, Figma, Smartphone, FileText,
    Link as LinkIcon, Plus, Trash2, ExternalLink, Check
} from 'lucide-react';

export interface ResourceLinkItem {
    id: string;
    label: string;
    url: string;
    category: 'live' | 'github' | 'apk' | 'figma' | 'doc' | 'custom';
}

export interface DynamicResourceLinksProps {
    links: ResourceLinkItem[];
    onChange: (updatedLinks: ResourceLinkItem[]) => void;
    readOnly?: boolean;
}

const PRESETS: Array<{ label: string; category: ResourceLinkItem['category']; icon: any }> = [
    { label: 'Live Hosted App (Vercel / Netlify)', category: 'live', icon: Globe },
    { label: 'GitHub Repository', category: 'github', icon: Github },
    { label: 'APK / Mobile Build (Google Drive)', category: 'apk', icon: Smartphone },
    { label: 'Figma Design Spec', category: 'figma', icon: Figma },
    { label: 'Project Documentation / API Spec', category: 'doc', icon: FileText },
];

export const DynamicResourceLinks: React.FC<DynamicResourceLinksProps> = ({
    links = [],
    onChange,
    readOnly = false
}) => {
    const [customLabel, setCustomLabel] = useState('');
    const [customUrl, setCustomUrl] = useState('');
    const [selectedCategory, setSelectedCategory] = useState<ResourceLinkItem['category']>('custom');

    const getCategoryIcon = (category: ResourceLinkItem['category']) => {
        switch (category) {
            case 'live': return <Globe size={15} color="#10b981" />;
            case 'github': return <Github size={15} color="#6366f1" />;
            case 'apk': return <Smartphone size={15} color="#f59e0b" />;
            case 'figma': return <Figma size={15} color="#ec4899" />;
            case 'doc': return <FileText size={15} color="#06b6d4" />;
            default: return <LinkIcon size={15} color="#64748b" />;
        }
    };

    const handleAddPreset = (preset: typeof PRESETS[0]) => {
        if (readOnly) return;
        const newLink: ResourceLinkItem = {
            id: `link_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
            label: preset.label,
            url: '',
            category: preset.category
        };
        onChange([...links, newLink]);
    };

    const handleAddCustom = (e: React.FormEvent) => {
        e.preventDefault();
        if (readOnly || !customLabel.trim() || !customUrl.trim()) return;

        let formattedUrl = customUrl.trim();
        if (!/^https?:\/\//i.test(formattedUrl)) {
            formattedUrl = `https://${formattedUrl}`;
        }

        const newLink: ResourceLinkItem = {
            id: `link_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
            label: customLabel.trim(),
            url: formattedUrl,
            category: selectedCategory
        };

        onChange([...links, newLink]);
        setCustomLabel('');
        setCustomUrl('');
        setSelectedCategory('custom');
    };

    const handleUrlChange = (id: string, newUrl: string) => {
        if (readOnly) return;
        onChange(links.map(link => link.id === id ? { ...link, url: newUrl } : link));
    };

    const handleRemoveLink = (id: string) => {
        if (readOnly) return;
        onChange(links.filter(link => link.id !== id));
    };

    return (
        <div style={{
            background: '#0f172a',
            border: '1px solid #334155',
            padding: '1.25rem',
            marginBottom: '1.5rem',
            color: '#f8fafc'
        }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', borderBottom: '1px solid #1e293b', paddingBottom: '0.75rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <ExternalLink size={18} color="#38bdf8" />
                    <h4 style={{ margin: 0, fontSize: '0.95rem', fontFamily: 'var(--font-heading)', textTransform: 'uppercase', color: '#f8fafc', letterSpacing: '0.05em' }}>
                        Deployment & External Project Links
                    </h4>
                </div>
                <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                    {links.length} Link{links.length !== 1 ? 's' : ''} Attached
                </span>
            </div>

            {/* PRESET QUICK-ADD BUTTONS (LEARNER EDIT MODE ONLY) */}
            {!readOnly && (
                <div style={{ marginBottom: '1.25rem' }}>
                    <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '8px' }}>
                        Quick-Add Presets:
                    </span>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        {PRESETS.map((preset) => {
                            const Icon = preset.icon;
                            const isAlreadyAdded = links.some(l => l.label === preset.label);
                            return (
                                <button
                                    key={preset.label}
                                    type="button"
                                    onClick={() => handleAddPreset(preset)}
                                    disabled={isAlreadyAdded}
                                    style={{
                                        display: 'inline-flex', alignItems: 'center', gap: '6px',
                                        fontSize: '0.75rem', fontWeight: 600, padding: '6px 12px',
                                        background: isAlreadyAdded ? '#1e293b' : '#1e293b',
                                        color: isAlreadyAdded ? '#64748b' : '#e2e8f0',
                                        border: `1px solid ${isAlreadyAdded ? '#334155' : '#475569'}`,
                                        cursor: isAlreadyAdded ? 'not-allowed' : 'pointer',
                                        opacity: isAlreadyAdded ? 0.6 : 1,
                                        transition: 'all 0.2s ease'
                                    }}
                                >
                                    <Icon size={13} /> {preset.label} {isAlreadyAdded ? <Check size={12} color="#10b981" /> : <Plus size={12} />}
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* ACTIVE LINK INPUT LIST */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: readOnly || links.length === 0 ? '0' : '1.25rem' }}>
                {links.map((link) => (
                    <div key={link.id} style={{
                        display: 'flex', alignItems: 'center', gap: '10px',
                        background: '#1e293b', border: '1px solid #334155', padding: '8px 12px'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: '180px', flexShrink: 0 }}>
                            {getCategoryIcon(link.category)}
                            <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#cbd5e1', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {link.label}
                            </span>
                        </div>

                        {readOnly ? (
                            <div style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {link.url ? (
                                    <a
                                        href={link.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        style={{ color: '#38bdf8', fontSize: '0.85rem', textDecoration: 'underline', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                                    >
                                        {link.url} <ExternalLink size={12} />
                                    </a>
                                ) : (
                                    <span style={{ color: '#64748b', fontSize: '0.8rem', fontStyle: 'italic' }}>No URL provided</span>
                                )}
                            </div>
                        ) : (
                            <input
                                type="url"
                                placeholder="https://..."
                                value={link.url}
                                onChange={(e) => handleUrlChange(link.id, e.target.value)}
                                style={{
                                    flex: 1, background: '#0f172a', border: '1px solid #475569',
                                    color: '#f8fafc', padding: '6px 10px', fontSize: '0.82rem',
                                    outline: 'none', borderRadius: 0
                                }}
                            />
                        )}

                        {!readOnly && (
                            <button
                                type="button"
                                onClick={() => handleRemoveLink(link.id)}
                                style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '4px' }}
                                title="Remove Link"
                            >
                                <Trash2 size={15} />
                            </button>
                        )}
                    </div>
                ))}
            </div>

            {/* DYNAMIC CUSTOM LINK CREATOR FORM */}
            {!readOnly && (
                <form onSubmit={handleAddCustom} style={{
                    display: 'flex', gap: '8px', flexWrap: 'wrap',
                    background: '#1e293b', padding: '10px', border: '1px dashed #475569'
                }}>
                    <input
                        type="text"
                        placeholder="Custom Label (e.g., Notion Docs, Expo Go, Postman API)"
                        value={customLabel}
                        onChange={(e) => setCustomLabel(e.target.value)}
                        style={{ flex: '1 1 200px', background: '#0f172a', border: '1px solid #334155', color: '#fff', padding: '6px 10px', fontSize: '0.8rem', outline: 'none' }}
                    />
                    <input
                        type="url"
                        placeholder="https://..."
                        value={customUrl}
                        onChange={(e) => setCustomUrl(e.target.value)}
                        style={{ flex: '2 1 250px', background: '#0f172a', border: '1px solid #334155', color: '#fff', padding: '6px 10px', fontSize: '0.8rem', outline: 'none' }}
                    />
                    <select
                        value={selectedCategory}
                        onChange={(e) => setSelectedCategory(e.target.value as any)}
                        style={{ background: '#0f172a', border: '1px solid #334155', color: '#94a3b8', padding: '6px 10px', fontSize: '0.8rem', outline: 'none' }}
                    >
                        <option value="custom">Custom Link</option>
                        <option value="live">Live Web App</option>
                        <option value="github">Source Code</option>
                        <option value="apk">Mobile Build / APK</option>
                        <option value="figma">Design Spec</option>
                        <option value="doc">Documentation</option>
                    </select>
                    <button
                        type="submit"
                        disabled={!customLabel.trim() || !customUrl.trim()}
                        style={{
                            background: '#38bdf8', color: '#0f172a', border: 'none',
                            padding: '6px 14px', fontWeight: 'bold', fontSize: '0.8rem',
                            cursor: (!customLabel.trim() || !customUrl.trim()) ? 'not-allowed' : 'pointer',
                            opacity: (!customLabel.trim() || !customUrl.trim()) ? 0.5 : 1,
                            display: 'flex', alignItems: 'center', gap: '4px'
                        }}
                    >
                        <Plus size={14} /> Add Custom Link
                    </button>
                </form>
            )}
        </div>
    );
};