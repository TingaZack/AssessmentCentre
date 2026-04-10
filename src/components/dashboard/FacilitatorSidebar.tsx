import React from 'react';
import { BookOpen, ClipboardCheck, UserCircle, LogOut, LayoutDashboard } from 'lucide-react';

interface Props {
    currentNav: string;
    onNavChange: (nav: string) => void;
    onLogout: () => void;
}

export const FacilitatorSidebar: React.FC<Props> = ({ currentNav, onNavChange, onLogout }) => {
    const menuItems = [
        { id: 'dashboard', label: 'My Classes', icon: LayoutDashboard },
        { id: 'attendance', label: 'Attendance', icon: ClipboardCheck },
        { id: 'profile', label: 'My Profile', icon: UserCircle },
        { id: 'assessments', label: 'Assessments', icon: BookOpen },
    ];

    // const menuItems = [
    //     { id: 'dashboard', label: 'My Classes', icon: LayoutDashboard },
    //     { id: 'history', label: 'Attendance History', icon: ClipboardCheck }, // changed
    //     { id: 'profile', label: 'My Profile', icon: UserCircle },
    // ];

    return (
        <aside className="sidebar">
            <div className="sidebar-logo">
                <div className="logo-icon">🔵</div>
                <div className="logo-text">
                    <span className="logo-main">Facilitator</span>
                    <span className="logo-sub">Hub</span>
                </div>
            </div>

            <nav className="sidebar-nav">
                {menuItems.map((item) => (
                    <button
                        key={item.id}
                        onClick={() => onNavChange(item.id)}
                        className={`nav-item ${currentNav === item.id ? 'active' : ''}`}
                    >
                        <item.icon size={20} />
                        <span>{item.label}</span>
                    </button>
                ))}
            </nav>

            <div className="sidebar-footer">
                <button className="nav-item logout" onClick={onLogout}>
                    <LogOut size={20} />
                    <span>Logout</span>
                </button>
            </div>
        </aside>
    );
};