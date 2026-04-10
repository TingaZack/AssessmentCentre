import React, { useState } from 'react';

interface Props {
    text: any;
    limit?: number;
    color?: string;
}

export const ExpandableText: React.FC<Props> = ({
    text,
    limit = 60,
    color = '#2563eb'
}) => {
    const [isExpanded, setIsExpanded] = useState(false);

    // Safety check for null/undefined text
    if (!text) return null;
    if (text.length <= limit) return <span>{text}</span>;

    return (
        <span style={{ lineHeight: '1.4' }}>
            {isExpanded ? text : `${text.substring(0, limit)}... `}
            <button
                onClick={(e) => {
                    e.stopPropagation(); // Prevents triggering row clicks if applicable
                    setIsExpanded(!isExpanded);
                }}
                style={{
                    background: 'none',
                    border: 'none',
                    color: color,
                    cursor: 'pointer',
                    fontSize: '0.85em',
                    fontWeight: 600,
                    padding: 0,
                    marginLeft: '4px',
                    textDecoration: 'underline',
                    display: 'inline-block'
                }}
            >
                {isExpanded ? 'Read Less' : 'Read More'}
            </button>
        </span>
    );
};