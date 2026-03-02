// src/components/common/PageHeader/PageHeader.tsx
// mLab CI v2.1 — ViewPortfolio aesthetic
//
// ── USAGE EXAMPLES ──────────────────────────────────────────────────────────
//
// 1. Default (white panel, green left accent):
//    <PageHeader title="Assessment Manager" />
//
// 2. With eyebrow, description, action button:
//    <PageHeader
//      title="Assessment Manager"
//      eyebrow="Facilitator Portal"
//      description="Create, schedule, and manage tests for your cohorts."
//      actions={
//        <PageHeader.Btn variant="primary" icon={<Plus size={15}/>} onClick={fn}>
//          New Assessment
//        </PageHeader.Btn>
//      }
//    />
//
// 3. Hero variant (dark blue panel) with back button + meta chips:
//    <PageHeader
//      variant="hero"
//      theme="assessor"
//      onBack={() => navigate(-1)}
//      backLabel="Back to Portfolio"
//      eyebrow="Summative Assessment"
//      title="Introduction to Project Management"
//      description="Read all instructions carefully."
//      meta={[
//        { icon: <BookOpen size={11}/>, label: 'Module 3' },
//        { icon: <Scale size={11}/>,    label: '60 Marks' },
//        { icon: <Clock size={11}/>,    label: '90 Min'   },
//      ]}
//      status={{ label: 'Not Started', variant: 'draft' }}
//    />
//
// 4. Compact variant with breadcrumb:
//    <PageHeader
//      variant="compact"
//      title="Learner Submissions"
//      breadcrumb={[
//        { label: 'Cohorts', onClick: () => navigate('/cohorts') },
//        { label: 'Learner Submissions' },
//      ]}
//    />
//
// 5. Role-based theming (drives accent colour via data-theme attribute):
//    Themes: 'admin' | 'student' | 'assessor' | 'facilitator' | 'moderator' | 'default'
//    <PageHeader theme="student" variant="hero" title="My Portfolio" />
// ────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { ArrowLeft } from 'lucide-react';
import './PageHeader.css';

/* ── Types ────────────────────────────────────────────────────────────────── */

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


// import React from 'react';
// import { ArrowLeft } from 'lucide-react';
// import './PageHeader.css';

// export type HeaderVariant = 'default' | 'hero' | 'compact';
// export type StatusVariant = 'active' | 'draft' | 'locked' | 'warning' | 'error';
// // 🚀 NEW: Role-based Theme Type
// export type HeaderTheme = 'admin' | 'student' | 'assessor' | 'facilitator' | 'moderator' | 'default';

// export interface BreadcrumbItem { label: string; onClick?: () => void; }

// export interface MetaChip {
//     icon?: React.ReactNode;
//     label: string;
//     color?: 'green' | 'amber' | 'red';
// }

// export interface PageHeaderProps {
//     variant?: HeaderVariant;
//     theme?: HeaderTheme; // 🚀 NEW: Theme Prop
//     eyebrow?: string;
//     title: string;
//     description?: string;
//     icon?: React.ReactNode;
//     onBack?: () => void;
//     backLabel?: string;
//     status?: { label: string; variant: StatusVariant };
//     meta?: MetaChip[];
//     breadcrumb?: BreadcrumbItem[];
//     actions?: React.ReactNode;
//     className?: string;
// }

// export const PageHeader: React.FC<PageHeaderProps> & { Btn: typeof HeaderBtn } = ({
//     variant = 'default',
//     theme = 'default',
//     eyebrow,
//     title,
//     description,
//     icon,
//     onBack,
//     backLabel = 'Back',
//     status,
//     meta,
//     breadcrumb,
//     actions,
//     className = '',
// }) => {
//     const hasMeta = meta && meta.length > 0;
//     const hasBreadcrumb = breadcrumb && breadcrumb.length > 0;

//     return (
//         <header
//             className={`ph ph--${variant} ${className}`}
//             data-theme={theme} // 🚀 NEW: Drives the CSS color overrides
//         >
//             <div className="ph__inner">
//                 {/* Left */}
//                 <div className="ph__left">
//                     {onBack && (
//                         <button className="ph__back" onClick={onBack} aria-label="Go back">
//                             <ArrowLeft size={14} /> {backLabel}
//                         </button>
//                     )}

//                     {icon && <div className="ph__icon" aria-hidden="true">{icon}</div>}

//                     <div className="ph__text">
//                         {eyebrow && <span className="ph__eyebrow">{eyebrow}</span>}
//                         <h1 className="ph__title">{title}</h1>
//                         {description && <p className="ph__desc">{description}</p>}

//                         {hasMeta && (
//                             <div className="ph__meta">
//                                 {meta!.map((chip, i) => (
//                                     <span key={i} className={`ph__chip${chip.color ? ` ph__chip--${chip.color}` : ''}`}>
//                                         {chip.icon}{chip.label}
//                                     </span>
//                                 ))}
//                             </div>
//                         )}
//                     </div>
//                 </div>

//                 {/* Right */}
//                 {(status || actions) && (
//                     <div className="ph__right">
//                         {status && (
//                             <span className={`ph__status ph__status--${status.variant}`}>
//                                 {status.label}
//                             </span>
//                         )}
//                         {actions}
//                     </div>
//                 )}
//             </div>

//             {/* Breadcrumb */}
//             {hasBreadcrumb && (
//                 <nav className="ph__breadcrumb" aria-label="Breadcrumb">
//                     {breadcrumb!.map((crumb, i) => {
//                         const isLast = i === breadcrumb!.length - 1;
//                         return (
//                             <React.Fragment key={i}>
//                                 {isLast ? (
//                                     <span className="ph__crumb ph__crumb--active" aria-current="page">{crumb.label}</span>
//                                 ) : (
//                                     <>
//                                         <button className="ph__crumb" onClick={crumb.onClick}>{crumb.label}</button>
//                                         <span className="ph__crumb-sep" aria-hidden="true">›</span>
//                                     </>
//                                 )}
//                             </React.Fragment>
//                         );
//                     })}
//                 </nav>
//             )}
//         </header>
//     );
// };

// /* ── PageHeader.Btn ──────────────────────────────────────────────────────── */
// interface HeaderBtnProps {
//     variant?: 'primary' | 'green' | 'outline' | 'ghost';
//     icon?: React.ReactNode;
//     onClick?: () => void;
//     disabled?: boolean;
//     title?: string;
//     children?: React.ReactNode;
// }

// const HeaderBtn: React.FC<HeaderBtnProps> = ({
//     variant = 'outline', icon, onClick, disabled, title, children,
// }) => (
//     <button
//         className={`ph__btn ph__btn--${variant}`}
//         onClick={onClick}
//         disabled={disabled}
//         title={title}
//     >
//         {icon}{children}
//     </button>
// );

// PageHeader.Btn = HeaderBtn;
// export default PageHeader;

// // // src/components/common/PageHeader/PageHeader.tsx
// // // mLab CI v2.1 — matches ViewPortfolio.css aesthetic
// // //
// // // ── USAGE EXAMPLES ─────────────────────────────────────────────────────────
// // //
// // // 1. Default (white panel, green-left border):
// // //    <PageHeader title="Assessment Manager" />
// // //
// // // 2. With eyebrow, description, action:
// // //    <PageHeader
// // //      title="Assessment Manager"
// // //      eyebrow="Facilitator Portal"
// // //      description="Create, schedule, and manage tests for your cohorts."
// // //      actions={<PageHeader.Btn variant="primary" icon={<Plus size={15}/>} onClick={fn}>New Assessment</PageHeader.Btn>}
// // //    />
// // //
// // // 3. Hero (dark blue panel) with back button + meta chips:
// // //    <PageHeader
// // //      variant="hero"
// // //      onBack={() => navigate(-1)}
// // //      backLabel="Back to Portfolio"
// // //      eyebrow="Summative Assessment"
// // //      title="Introduction to Project Management"
// // //      description="Read all instructions carefully."
// // //      meta={[
// // //        { icon: <BookOpen size={11}/>, label: 'Module 3' },
// // //        { icon: <Scale size={11}/>,    label: '60 Marks' },
// // //        { icon: <Clock size={11}/>,    label: '90 Min'   },
// // //      ]}
// // //      status={{ label: 'Not Started', variant: 'draft' }}
// // //    />
// // //
// // // 4. Compact (flush underline) with breadcrumb:
// // //    <PageHeader
// // //      variant="compact"
// // //      title="Learner Submissions"
// // //      breadcrumb={[
// // //        { label: 'Cohorts', onClick: () => navigate('/cohorts') },
// // //        { label: 'Learner Submissions' },
// // //      ]}
// // //    />
// // // ───────────────────────────────────────────────────────────────────────────

// // import React from 'react';
// // import { ArrowLeft } from 'lucide-react';
// // import './PageHeader.css';

// // export type HeaderVariant = 'default' | 'hero' | 'compact';
// // export type StatusVariant = 'active' | 'draft' | 'locked' | 'warning' | 'error';

// // export interface BreadcrumbItem { label: string; onClick?: () => void; }

// // export interface MetaChip {
// //     icon?: React.ReactNode;
// //     label: string;
// //     color?: 'green' | 'amber' | 'red';
// // }

// // export interface PageHeaderProps {
// //     variant?: HeaderVariant;
// //     eyebrow?: string;
// //     title: string;
// //     description?: string;
// //     icon?: React.ReactNode;
// //     onBack?: () => void;
// //     backLabel?: string;
// //     status?: { label: string; variant: StatusVariant };
// //     meta?: MetaChip[];
// //     breadcrumb?: BreadcrumbItem[];
// //     actions?: React.ReactNode;
// //     className?: string;
// // }

// // export const PageHeader: React.FC<PageHeaderProps> & { Btn: typeof HeaderBtn } = ({
// //     variant = 'default',
// //     eyebrow,
// //     title,
// //     description,
// //     icon,
// //     onBack,
// //     backLabel = 'Back',
// //     status,
// //     meta,
// //     breadcrumb,
// //     actions,
// //     className = '',
// // }) => {
// //     const hasMeta = meta && meta.length > 0;
// //     const hasBreadcrumb = breadcrumb && breadcrumb.length > 0;

// //     return (
// //         <header className={`ph ph--${variant} ${className}`}>
// //             <div className="ph__inner">
// //                 {/* Left */}
// //                 <div className="ph__left">
// //                     {onBack && (
// //                         <button className="ph__back" onClick={onBack} aria-label="Go back">
// //                             <ArrowLeft size={14} /> {backLabel}
// //                         </button>
// //                     )}

// //                     {icon && <div className="ph__icon" aria-hidden="true">{icon}</div>}

// //                     <div className="ph__text">
// //                         {eyebrow && <span className="ph__eyebrow">{eyebrow}</span>}
// //                         <h1 className="ph__title">{title}</h1>
// //                         {description && <p className="ph__desc">{description}</p>}

// //                         {hasMeta && (
// //                             <div className="ph__meta">
// //                                 {meta!.map((chip, i) => (
// //                                     <span key={i} className={`ph__chip${chip.color ? ` ph__chip--${chip.color}` : ''}`}>
// //                                         {chip.icon}{chip.label}
// //                                     </span>
// //                                 ))}
// //                             </div>
// //                         )}
// //                     </div>
// //                 </div>

// //                 {/* Right */}
// //                 {(status || actions) && (
// //                     <div className="ph__right">
// //                         {status && (
// //                             <span className={`ph__status ph__status--${status.variant}`}>
// //                                 {status.label}
// //                             </span>
// //                         )}
// //                         {actions}
// //                     </div>
// //                 )}
// //             </div>

// //             {/* Breadcrumb */}
// //             {hasBreadcrumb && (
// //                 <nav className="ph__breadcrumb" aria-label="Breadcrumb">
// //                     {breadcrumb!.map((crumb, i) => {
// //                         const isLast = i === breadcrumb!.length - 1;
// //                         return (
// //                             <React.Fragment key={i}>
// //                                 {isLast ? (
// //                                     <span className="ph__crumb ph__crumb--active" aria-current="page">{crumb.label}</span>
// //                                 ) : (
// //                                     <>
// //                                         <button className="ph__crumb" onClick={crumb.onClick}>{crumb.label}</button>
// //                                         <span className="ph__crumb-sep" aria-hidden="true">›</span>
// //                                     </>
// //                                 )}
// //                             </React.Fragment>
// //                         );
// //                     })}
// //                 </nav>
// //             )}
// //         </header>
// //     );
// // };

// // /* ── PageHeader.Btn ──────────────────────────────────────────────────────── */
// // interface HeaderBtnProps {
// //     variant?: 'primary' | 'green' | 'outline' | 'ghost';
// //     icon?: React.ReactNode;
// //     onClick?: () => void;
// //     disabled?: boolean;
// //     title?: string;
// //     children?: React.ReactNode;
// // }

// // const HeaderBtn: React.FC<HeaderBtnProps> = ({
// //     variant = 'outline', icon, onClick, disabled, title, children,
// // }) => (
// //     <button
// //         className={`ph__btn ph__btn--${variant}`}
// //         onClick={onClick}
// //         disabled={disabled}
// //         title={title}
// //     >
// //         {icon}{children}
// //     </button>
// // );

// // PageHeader.Btn = HeaderBtn;
// // export default PageHeader;


// // // // src/components/common/PageHeader/PageHeader.tsx
// // // // mLab CI Brand-aligned Page Header — v2.1
// // // // Works across Learner Portal, Facilitator Portal, and Admin views.
// // // //
// // // // ── USAGE EXAMPLES ─────────────────────────────────────────────────────────
// // // //
// // // // 1. Simple default header:
// // // //    <PageHeader title="Assessment Manager" />
// // // //
// // // // 2. With eyebrow, description, and a primary action:
// // // //    <PageHeader
// // // //      title="Assessment Manager"
// // // //      eyebrow="Facilitator Portal"
// // // //      description="Create, schedule, and manage tests for your cohorts."
// // // //      actions={<PageHeader.Btn variant="primary" icon={<Plus size={15} />} onClick={...}>New Assessment</PageHeader.Btn>}
// // // //    />
// // // //
// // // // 3. Hero variant (dark blue panel) with back button and meta chips:
// // // //    <PageHeader
// // // //      variant="hero"
// // // //      title="Introduction to Project Management"
// // // //      eyebrow="Summative Assessment"
// // // //      description="Read all instructions carefully before starting."
// // // //      onBack={() => navigate(-1)}
// // // //      status={{ label: 'In Progress', variant: 'active' }}
// // // //      meta={[
// // // //        { icon: <BookOpen size={11} />, label: 'Module 3' },
// // // //        { icon: <Scale size={11} />,    label: '60 Marks' },
// // // //        { icon: <Clock size={11} />,    label: '90 Min' },
// // // //      ]}
// // // //    />
// // // //
// // // // 4. Compact variant with breadcrumb:
// // // //    <PageHeader
// // // //      variant="compact"
// // // //      title="Edit Assessment"
// // // //      breadcrumb={[
// // // //        { label: 'Assessments', onClick: () => navigate('/facilitator/assessments') },
// // // //        { label: 'Edit Assessment' },
// // // //      ]}
// // // //    />
// // // //
// // // // 5. With a left icon slot:
// // // //    <PageHeader
// // // //      title="Learner Portfolio"
// // // //      icon={<GraduationCap size={24} />}
// // // //    />
// // // // ───────────────────────────────────────────────────────────────────────────

// // // import React from 'react';
// // // import { ArrowLeft } from 'lucide-react';
// // // import './PageHeader.css';

// // // /* ── Types ──────────────────────────────────────────────────────────────── */
// // // export type HeaderVariant = 'default' | 'hero' | 'compact';

// // // export type StatusVariant = 'active' | 'draft' | 'locked' | 'warning' | 'error';

// // // export interface BreadcrumbItem {
// // //     label: string;
// // //     onClick?: () => void;
// // // }

// // // export interface MetaChip {
// // //     icon?: React.ReactNode;
// // //     label: string;
// // //     /** Optional colour override: 'green' | 'amber' | 'red' */
// // //     color?: 'green' | 'amber' | 'red';
// // // }

// // // export interface PageHeaderProps {
// // //     /** Visual style of the header. Defaults to 'default'. */
// // //     variant?: HeaderVariant;

// // //     /** Small all-caps label above the title (e.g. "Facilitator Portal") */
// // //     eyebrow?: string;

// // //     /** Main page title — required */
// // //     title: string;

// // //     /** Supporting sentence below the title */
// // //     description?: string;

// // //     /** Optional square icon slot to the left of the title text */
// // //     icon?: React.ReactNode;

// // //     /** Renders a back button. Provide the handler to enable it. */
// // //     onBack?: () => void;

// // //     /** Label for the back button. Defaults to 'Back' */
// // //     backLabel?: string;

// // //     /** Status badge rendered in the right slot */
// // //     status?: {
// // //         label: string;
// // //         variant: StatusVariant;
// // //     };

// // //     /** Small info chips below the title (module, marks, time limit, etc.) */
// // //     meta?: MetaChip[];

// // //     /** Breadcrumb navigation row (rendered below the main row) */
// // //     breadcrumb?: BreadcrumbItem[];

// // //     /** Arbitrary action buttons / controls for the right side */
// // //     actions?: React.ReactNode;

// // //     /** Additional class names on the root element */
// // //     className?: string;
// // // }

// // // /* ══════════════════════════════════════════════════════════════════════════
// // //    PAGE HEADER COMPONENT
// // // ══════════════════════════════════════════════════════════════════════════ */
// // // export const PageHeader: React.FC<PageHeaderProps> & {
// // //     Btn: typeof HeaderBtn;
// // // } = ({
// // //     variant = 'default',
// // //     eyebrow,
// // //     title,
// // //     description,
// // //     icon,
// // //     onBack,
// // //     backLabel = 'Back',
// // //     status,
// // //     meta,
// // //     breadcrumb,
// // //     actions,
// // //     className = '',
// // // }) => {
// // //         const hasMeta = meta && meta.length > 0;
// // //         const hasBreadcrumb = breadcrumb && breadcrumb.length > 0;

// // //         return (
// // //             <header className={`ph ph--${variant} ${className}`}>
// // //                 {/* ── Main row ── */}
// // //                 <div className="ph__inner">

// // //                     {/* Left: optional back + icon + text */}
// // //                     <div className="ph__left">
// // //                         {onBack && (
// // //                             <button className="ph__back" onClick={onBack} aria-label="Go back">
// // //                                 <ArrowLeft size={14} />
// // //                                 {backLabel}
// // //                             </button>
// // //                         )}

// // //                         {icon && (
// // //                             <div className="ph__icon" aria-hidden="true">{icon}</div>
// // //                         )}

// // //                         <div className="ph__text">
// // //                             {eyebrow && <span className="ph__eyebrow">{eyebrow}</span>}
// // //                             <h1 className="ph__title">{title}</h1>
// // //                             {description && <p className="ph__desc">{description}</p>}

// // //                             {/* Meta chips */}
// // //                             {hasMeta && (
// // //                                 <div className="ph__meta">
// // //                                     {meta!.map((chip, i) => (
// // //                                         <span
// // //                                             key={i}
// // //                                             className={`ph__chip${chip.color ? ` ph__chip--${chip.color}` : ''}`}
// // //                                         >
// // //                                             {chip.icon}
// // //                                             {chip.label}
// // //                                         </span>
// // //                                     ))}
// // //                                 </div>
// // //                             )}
// // //                         </div>
// // //                     </div>

// // //                     {/* Right: status + action buttons */}
// // //                     {(status || actions) && (
// // //                         <div className="ph__right">
// // //                             {status && (
// // //                                 <span className={`ph__status ph__status--${status.variant}`}>
// // //                                     {status.label}
// // //                                 </span>
// // //                             )}
// // //                             {actions}
// // //                         </div>
// // //                     )}
// // //                 </div>

// // //                 {/* ── Breadcrumb row ── */}
// // //                 {hasBreadcrumb && (
// // //                     <nav className="ph__breadcrumb" aria-label="Breadcrumb">
// // //                         {breadcrumb!.map((crumb, i) => {
// // //                             const isLast = i === breadcrumb!.length - 1;
// // //                             return (
// // //                                 <React.Fragment key={i}>
// // //                                     {isLast ? (
// // //                                         <span className="ph__crumb ph__crumb--active" aria-current="page">
// // //                                             {crumb.label}
// // //                                         </span>
// // //                                     ) : (
// // //                                         <>
// // //                                             <button className="ph__crumb" onClick={crumb.onClick}>
// // //                                                 {crumb.label}
// // //                                             </button>
// // //                                             <span className="ph__crumb-sep" aria-hidden="true">›</span>
// // //                                         </>
// // //                                     )}
// // //                                 </React.Fragment>
// // //                             );
// // //                         })}
// // //                     </nav>
// // //                 )}
// // //             </header>
// // //         );
// // //     };

// // // /* ══════════════════════════════════════════════════════════════════════════
// // //    HEADER BUTTON — sub-component for the actions slot
// // //    Usage: <PageHeader.Btn variant="primary" icon={<Plus />} onClick={fn}>
// // //               New Assessment
// // //           </PageHeader.Btn>
// // // ══════════════════════════════════════════════════════════════════════════ */
// // // interface HeaderBtnProps {
// // //     variant?: 'primary' | 'secondary' | 'outline' | 'ghost';
// // //     icon?: React.ReactNode;
// // //     onClick?: () => void;
// // //     disabled?: boolean;
// // //     title?: string;
// // //     children?: React.ReactNode;
// // // }

// // // const HeaderBtn: React.FC<HeaderBtnProps> = ({
// // //     variant = 'outline',
// // //     icon,
// // //     onClick,
// // //     disabled,
// // //     title,
// // //     children,
// // // }) => (
// // //     <button
// // //         className={`ph__btn ph__btn--${variant}`}
// // //         onClick={onClick}
// // //         disabled={disabled}
// // //         title={title}
// // //     >
// // //         {icon}
// // //         {children}
// // //     </button>
// // // );

// // // // Attach as sub-component so consumers import only PageHeader
// // // PageHeader.Btn = HeaderBtn;

// // // export default PageHeader;