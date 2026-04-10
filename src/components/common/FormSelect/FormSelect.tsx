import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Search, ChevronDown, X } from 'lucide-react';
import './FormSelect.css';

interface Option {
    value: string;
    label: string;
    subLabel?: string; // For things like "Town (Municipality)"
}

interface FormSelectProps {
    label: string;
    value: string;
    options: Option[];
    onChange: (val: string) => void;
    placeholder?: string;
    disabled?: boolean;
    required?: boolean;
    isSearchable?: boolean;
}

export const FormSelect: React.FC<FormSelectProps> = ({
    label, value, options, onChange, placeholder = "Select...", disabled, required, isSearchable = true
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState("");
    const containerRef = useRef<HTMLDivElement>(null);

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    // Filter logic
    const filteredOptions = useMemo(() => {
        if (!searchTerm) return options.slice(0, 50); // Show first 50 if no search
        const s = searchTerm.toLowerCase();
        return options.filter(o =>
            o.label.toLowerCase().includes(s) ||
            o.value.toLowerCase().includes(s) ||
            o.subLabel?.toLowerCase().includes(s)
        ).slice(0, 50); // Performance cap
    }, [searchTerm, options]);

    const selectedOption = options.find(o => o.value === value);

    return (
        <div className={`form-select-container ${disabled ? 'disabled' : ''}`} ref={containerRef}>
            <label className="form-select-label">{label} {required && "*"}</label>

            <div className={`form-select-trigger ${isOpen ? 'open' : ''}`} onClick={() => !disabled && setIsOpen(!isOpen)}>
                <div className="form-select-value">
                    {selectedOption ? (
                        <span className="selected-text">{selectedOption.label}</span>
                    ) : (
                        <span className="placeholder-text">{placeholder}</span>
                    )}
                </div>
                <ChevronDown size={14} className={`chevron ${isOpen ? 'rotate' : ''}`} />
            </div>

            {isOpen && (
                <div className="form-select-dropdown">
                    {isSearchable && (
                        <div className="form-select-search">
                            <Search size={14} />
                            <input
                                autoFocus
                                type="text"
                                placeholder="Search..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                onClick={(e) => e.stopPropagation()}
                            />
                            {searchTerm && <X size={14} className="clear-search" onClick={() => setSearchTerm("")} />}
                        </div>
                    )}

                    <div className="form-select-options">
                        {filteredOptions.length > 0 ? (
                            filteredOptions.map(opt => (
                                <div
                                    key={opt.value}
                                    className={`form-select-option ${value === opt.value ? 'selected' : ''}`}
                                    onClick={() => {
                                        onChange(opt.value);
                                        setIsOpen(false);
                                        setSearchTerm("");
                                    }}
                                >
                                    <div className="option-label">{opt.label}</div>
                                    {opt.subLabel && <div className="option-sublabel">{opt.subLabel}</div>}
                                </div>
                            ))
                        ) : (
                            <div className="no-results">No matching results found</div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};