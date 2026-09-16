// src/components/common/QuillHTMLViewer/QuillHTMLViewer.tsx

import React, { useId } from 'react';
import 'react-quill-new/dist/quill.snow.css';

interface QuillHTMLViewerProps {
    html?: string | null;
    placeholder?: string;
    className?: string;
    style?: React.CSSProperties;
    textColor?: string;
}

export const formatQuillHtml = (content?: string | null): string => {
    if (!content || typeof content !== 'string') return '';
    const trimmed = content.trim();
    if (!trimmed) return '';

    // Strip inline background styles embedded by Quill editor
    const cleaned = trimmed
        .replace(/background-color\s*:\s*[^;"]+;?/gi, '')
        .replace(/background\s*:\s*[^;"]+;?/gi, '');

    const hasHtmlTags = /<[a-z][\s\S]*>/i.test(cleaned);
    if (hasHtmlTags) return cleaned;

    return cleaned
        .split(/\n\s*\n/)
        .map(p => `<p>${p.replace(/\n/g, '<br/>')}</p>`)
        .join('');
};

export const QuillHTMLViewer: React.FC<QuillHTMLViewerProps> = ({
    html,
    placeholder = 'No content available.',
    className = '',
    style,
    textColor
}) => {
    const uniqueId = `qvh-${useId().replace(/:/g, '')}`;
    const formatted = formatQuillHtml(html);

    if (!formatted) {
        return (
            <div style={{ color: '#64748b', fontStyle: 'italic', fontSize: '0.85rem', fontFamily: 'var(--font-body, inherit)', ...style }}>
                {placeholder}
            </div>
        );
    }

    return (
        <div
            id={uniqueId}
            className={`ql-container ql-snow ${className}`}
            style={{
                border: 'none',
                background: 'transparent',
                backgroundColor: 'transparent',
                color: textColor || 'inherit',
                fontFamily: 'var(--font-body, inherit)',
                ...style
            }}
        >
            <style>{`
                /* Enforce global body fonts and remove backgrounds */
                #${uniqueId}.ql-container.ql-snow,
                #${uniqueId} .ql-editor,
                #${uniqueId} .ql-editor *,
                #${uniqueId} .ql-editor p,
                #${uniqueId} .ql-editor span,
                #${uniqueId} .ql-editor div {
                    background: transparent !important;
                    background-color: transparent !important;
                    box-shadow: none !important;
                    font-family: var(--font-body, inherit) !important;
                    line-height: 1.5 !important;
                }

                /* Enforce global heading fonts */
                #${uniqueId} .ql-editor h1,
                #${uniqueId} .ql-editor h2,
                #${uniqueId} .ql-editor h3,
                #${uniqueId} .ql-editor h4,
                #${uniqueId} .ql-editor h5,
                #${uniqueId} .ql-editor h6 {
                    font-family: var(--font-heading, inherit) !important;
                    font-weight: 800 !important;
                }

                /* Explicitly enforce list bullets and numbering against CSS resets */
                #${uniqueId} .ql-editor ul {
                    list-style-type: disc !important;
                    padding-left: 1.5rem !important;
                    margin-top: 0.4rem !important;
                    margin-bottom: 0.4rem !important;
                }
                #${uniqueId} .ql-editor ol {
                    list-style-type: decimal !important;
                    padding-left: 1.5rem !important;
                    margin-top: 0.4rem !important;
                    margin-bottom: 0.4rem !important;
                }
                #${uniqueId} .ql-editor li {
                    list-style-type: inherit !important;
                    padding-left: 0.25rem !important;
                    margin-bottom: 0.25rem !important;
                    font-family: var(--font-body, inherit) !important;
                }

                /* Text Color Overrides */
                ${textColor ? `#${uniqueId} .ql-editor, #${uniqueId} .ql-editor *, #${uniqueId} .ql-editor h1, #${uniqueId} .ql-editor h2, #${uniqueId} .ql-editor h3 { color: ${textColor} !important; }` : ''}
            `}</style>
            <div
                className="ql-editor"
                style={{
                    padding: 0,
                    minHeight: 'auto',
                    background: 'transparent',
                    backgroundColor: 'transparent',
                    color: textColor || 'inherit'
                }}
                dangerouslySetInnerHTML={{ __html: formatted }}
            />
        </div>
    );
};