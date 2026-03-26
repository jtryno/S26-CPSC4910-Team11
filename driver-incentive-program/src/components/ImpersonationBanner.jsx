import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { exitImpersonation } from '../api/ImpersonationApi';

const ImpersonationBanner = () => {
    const [originalUser, setOriginalUser] = useState(null);
    const [targetUser, setTargetUser] = useState(null);
    const [exiting, setExiting] = useState(false);
    const navigate = useNavigate();

    useEffect(() => {
        const check = () => {
            const stored = localStorage.getItem('impersonation_original_user');
            if (stored) {
                setOriginalUser(JSON.parse(stored));
                const current = localStorage.getItem('user') || sessionStorage.getItem('user');
                if (current) setTargetUser(JSON.parse(current));
            } else {
                setOriginalUser(null);
                setTargetUser(null);
            }
        };

        check();
        window.addEventListener('authStateChanged', check);
        window.addEventListener('storage', check);
        return () => {
            window.removeEventListener('authStateChanged', check);
            window.removeEventListener('storage', check);
        };
    }, []);

    // Reset exiting state when impersonation changes
    useEffect(() => {
        setExiting(false);
    }, [originalUser]);

    // Toggle body class for navbar/content offset
    useEffect(() => {
        if (originalUser) {
            document.body.classList.add('impersonating');
        } else {
            document.body.classList.remove('impersonating');
        }
        return () => document.body.classList.remove('impersonating');
    }, [originalUser]);

    if (!originalUser || !targetUser) return null;

    const handleExit = async () => {
        setExiting(true);
        try {
            await exitImpersonation();
            navigate('/dashboard');
        } catch (err) {
            console.error('Failed to exit impersonation:', err);
            setExiting(false);
        }
    };

    return (
        <div className="impersonation-banner">
            <span>
                Viewing as <strong>{targetUser.username}</strong> ({targetUser.user_type})
            </span>
            <button
                onClick={handleExit}
                disabled={exiting}
                style={{
                    padding: '4px 14px',
                    borderRadius: '4px',
                    border: '1px solid #1a1a1a',
                    background: '#fff',
                    color: '#1a1a1a',
                    cursor: exiting ? 'not-allowed' : 'pointer',
                    fontWeight: '600',
                    fontSize: '13px',
                }}
            >
                {exiting ? 'Exiting...' : 'Exit Impersonation'}
            </button>
        </div>
    );
};

export default ImpersonationBanner;
