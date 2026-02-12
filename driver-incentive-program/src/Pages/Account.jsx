import React, { use, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { handleLogout } from '../Context/AuthContext';

const Account = () => {
    const [userData, setUserData] = useState(() => {
        const storedUser = localStorage.getItem('user') || sessionStorage.getItem('user');
        return storedUser ? JSON.parse(storedUser) : null;
    });
    const navigate = useNavigate();

    return (userData ? (
            <div>Logged in</div>
        ) : (
            <div>Please log in</div>
        )
    );
}