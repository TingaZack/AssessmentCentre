// src/layouts/FacilitatorLayout/FacilitatorLayout.tsx

import React, { useState, useEffect } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { Menu, X } from 'lucide-react'; // 🚀 Added Icons
import { signOut } from 'firebase/auth';
import './FacilitatorLayout.css'; // 🚀 Import the new CSS
import { useStore } from '../../../store/useStore';
import { auth } from '../../../lib/firebase';
import { Sidebar } from '../../../components/dashboard/Sidebar/Sidebar';

export const FacilitatorLayout: React.FC = () => {
    const { user, setUser } = useStore();
    const navigate = useNavigate();
    const location = useLocation();

    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

    useEffect(() => {
        setIsMobileMenuOpen(false);
    }, [location.pathname]);

    const currentNav = location.pathname.includes('attendance') ? 'attendance' :
        location.pathname.includes('assessments') ? 'assessments' :
            location.pathname.includes('profile') ? 'profile' : 'dashboard';

    const handleLogout = async () => {
        try {
            await signOut(auth);
            setUser(null);
            navigate('/login');
        } catch (error) {
            console.error("Logout failed:", error);
        }
    };

    return (
        <div className="fac-layout-container">

            {/* MOBILE HEADER (Only visible on small screens) */}
            <div className="fac-mobile-header">
                <button
                    className="fac-hamburger-btn"
                    onClick={() => setIsMobileMenuOpen(true)}
                >
                    <Menu size={24} />
                </button>
                <div className="fac-mobile-title">Facilitator Portal</div>
            </div>

            {/* OVERLAY (Clicking outside the sidebar closes it) */}
            {isMobileMenuOpen && (
                <div
                    className="fac-sidebar-overlay"
                    onClick={() => setIsMobileMenuOpen(false)}
                />
            )}

            {/* SIDEBAR WRAPPER */}
            <div className={`fac-sidebar-wrapper ${isMobileMenuOpen ? 'open' : ''}`}>
                {/* Optional close button inside sidebar for mobile */}
                <button
                    className="fac-close-btn"
                    onClick={() => setIsMobileMenuOpen(false)}
                >
                    <X size={24} />
                </button>

                <Sidebar
                    role={user?.role}
                    currentNav={currentNav}
                    onLogout={handleLogout}
                />
            </div>

            {/* MAIN CONTENT */}
            <main className="fac-main-content">
                <div className="fac-content-inner">
                    <Outlet />
                </div>
            </main>

        </div>
    );
};