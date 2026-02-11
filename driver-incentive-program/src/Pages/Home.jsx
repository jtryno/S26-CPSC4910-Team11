import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

const Home = () => {
  const [userData, setUserData] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    // Check if user data exists in session or localStorage (for remember me)
    const storedUser = localStorage.getItem('user') || sessionStorage.getItem('user');
    if (storedUser) {
      setUserData(JSON.parse(storedUser));
    }
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('user');
    sessionStorage.removeItem('user');
    // Dispatch event to notify app of logout
    window.dispatchEvent(new Event('authStateChanged'));
    setUserData(null);
    navigate('/login');
  };

  if (!userData) {
    return (
      <div style={{ textAlign: 'center', padding: '40px' }}>
        <h1>Welcome to the Driver Incentive Program</h1>
        <p>Please log in to continue.</p>
      </div>
    );
  }

  return (
    <div style={{ padding: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px' }}>
        <h1>Welcome, {userData.username}!</h1>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button 
            onClick={() => navigate('/password-reset')}
            style={{ padding: '10px 20px', background: '#ffc107', color: 'black', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
          >
            Reset Password
          </button>
          <button 
            onClick={handleLogout}
            style={{ padding: '10px 20px', background: '#dc3545', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
          >
            Logout
          </button>
        </div>
      </div>
      
      <div style={{ background: '#f8f9fa', padding: '20px', borderRadius: '8px', marginBottom: '20px' }}>
        <h2>User Information</h2>
        <p><strong>Email:</strong> {userData.email}</p>
        <p><strong>User ID:</strong> {userData.user_id}</p>
      </div>

      <div style={{ background: '#e7f3ff', padding: '20px', borderRadius: '8px' }}>
        <h3>About the Driver Incentive Program</h3>
        <p>This is your dashboard where you can manage your driver profile, view your points balance, and browse rewards.</p>
        <p><em>More features coming soon!</em></p>
      </div>
    </div>
  );
};

export default Home;
