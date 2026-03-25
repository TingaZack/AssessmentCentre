import React from 'react';
import { ArrowLeft } from 'lucide-react';
import './PageHeader.css';

export type HeaderVariant = 'default' | 'hero' | 'compact';
export type StatusVariant = 'active' | 'draft' | 'locked' | 'warning' | 'error';
export type HeaderTheme = 'admin' | 'student' | 'assessor' | 'facilitator' | 'moderator' | 'default';

export interface BreadcrumbItem {
    label: string;
    onClick?: () => void;
}

export interface MetaChip {
    icon?: React.ReactNode;
    label: string;
    /** Optional colour override: 'green' | 'amber' | 'red' */
    color?: 'green' | 'amber' | 'red';
}

export interface PageHeaderProps {
    /** Visual style. Defaults to 'default'. */
    variant?: HeaderVariant;
    /** Role-based colour theme. Drives accent colour via data-theme attr. */
    theme?: HeaderTheme;
    /** Small all-caps label above the title */
    eyebrow?: string;
    /** Main page title — required */
    title: string;
    /** Supporting sentence below the title */
    description?: string;
    /** Optional square icon slot to the left of the title text */
    icon?: React.ReactNode;
    /** Renders a back button */
    onBack?: () => void;
    /** Label for the back button. Defaults to 'Back' */
    backLabel?: string;
    /** Status badge in the right slot */
    status?: { label: string; variant: StatusVariant };
    /** Small info chips below the title */
    meta?: MetaChip[];
    /** Breadcrumb row rendered below the main row */
    breadcrumb?: BreadcrumbItem[];
    /** Arbitrary action buttons for the right slot */
    actions?: React.ReactNode;
    /** Additional class names on the root element */
    className?: string;
}

/* ── Component ───────────────────────────────────────────────────────────── */

export const PageHeader: React.FC<PageHeaderProps> & { Btn: typeof HeaderBtn } = ({
    variant = 'default',
    theme = 'default',
    eyebrow,
    title,
    description,
    icon,
    onBack,
    backLabel = 'Back',
    status,
    meta,
    breadcrumb,
    actions,
    className = '',
}) => {
    const hasMeta = meta && meta.length > 0;
    const hasBreadcrumb = breadcrumb && breadcrumb.length > 0;

    return (
        <header
            className={`ph ph--${variant} ${className}`}
            data-theme={theme}
        >
            <div className="ph__inner">

                {/* ── Left: back + icon + text ── */}
                <div className="ph__left">
                    {onBack && (
                        <button className="ph__back" onClick={onBack} aria-label="Go back">
                            <ArrowLeft size={14} /> {backLabel}
                        </button>
                    )}

                    {icon && <div className="ph__icon" aria-hidden="true">{icon}</div>}

                    <div className="ph__text">
                        {eyebrow && <span className="ph__eyebrow">{eyebrow}</span>}
                        <h1 className="ph__title">{title}</h1>
                        {description && <p className="ph__desc">{description}</p>}

                        {hasMeta && (
                            <div className="ph__meta">
                                {meta!.map((chip, i) => (
                                    <span
                                        key={i}
                                        className={`ph__chip${chip.color ? ` ph__chip--${chip.color}` : ''}`}
                                    >
                                        {chip.icon}{chip.label}
                                    </span>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* ── Right: status + actions ── */}
                {(status || actions) && (
                    <div className="ph__right">
                        {status && (
                            <span className={`ph__status ph__status--${status.variant}`}>
                                {status.label}
                            </span>
                        )}
                        {actions}
                    </div>
                )}
            </div>

            {/* ── Breadcrumb ── */}
            {hasBreadcrumb && (
                <nav className="ph__breadcrumb" aria-label="Breadcrumb">
                    {breadcrumb!.map((crumb, i) => {
                        const isLast = i === breadcrumb!.length - 1;
                        return (
                            <React.Fragment key={i}>
                                {isLast ? (
                                    <span className="ph__crumb ph__crumb--active" aria-current="page">
                                        {crumb.label}
                                    </span>
                                ) : (
                                    <>
                                        <button className="ph__crumb" onClick={crumb.onClick}>
                                            {crumb.label}
                                        </button>
                                        <span className="ph__crumb-sep" aria-hidden="true">›</span>
                                    </>
                                )}
                            </React.Fragment>
                        );
                    })}
                </nav>
            )}
        </header>
    );
};

/* ── PageHeader.Btn sub-component ────────────────────────────────────────── */

interface HeaderBtnProps {
    variant?: 'primary' | 'green' | 'outline' | 'ghost';
    icon?: React.ReactNode;
    onClick?: () => void;
    disabled?: boolean;
    title?: string;
    children?: React.ReactNode;
}

const HeaderBtn: React.FC<HeaderBtnProps> = ({
    variant = 'outline', icon, onClick, disabled, title, children,
}) => (
    <button
        className={`ph__btn ph__btn--${variant}`}
        onClick={onClick}
        disabled={disabled}
        title={title}
    >
        {icon}{children}
    </button>
);

PageHeader.Btn = HeaderBtn;
export default PageHeader;

