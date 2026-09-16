// src/components/common/CodeEditorField.tsx

import React from 'react';
import Editor from '@monaco-editor/react';

interface CodeEditorFieldProps {
    value: string;
    onChange: (value: string) => void;
    language?: string;
    height?: string;
    readOnly?: boolean;
    placeholder?: string;
}

export const CodeEditorField: React.FC<CodeEditorFieldProps> = ({
    value,
    onChange,
    language = 'javascript',
    height = '200px',
    readOnly = false
}) => {
    return (
        <div style={{
            border: '1px solid #334155',
            overflow: 'hidden',
            background: '#1e293b'
        }}>
            <Editor
                height={height}
                language={language}
                theme="vs-dark"
                value={value}
                onChange={(val) => onChange(val || '')}
                options={{
                    readOnly,
                    minimap: { enabled: false },
                    fontSize: 13,
                    lineNumbers: 'on',
                    scrollBeyondLastLine: false,
                    automaticLayout: true,
                    tabSize: 2,
                    wordWrap: 'on',
                    padding: { top: 10, bottom: 10 },
                    fontFamily: 'Consolas, Monaco, "Andale Mono", monospace'
                }}
            />
        </div>
    );
};