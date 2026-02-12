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
      <div style={{ textAlign: 'center', padding: '100px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <h1 style={{ color: '#1a1a1a', marginBottom: '15px', fontSize: '2.5rem' }}>Welcome to the Driver Incentive Program</h1>
        <p style={{ color: '#666666', fontSize: '1.2rem', marginBottom: '30px' }}>Please log in to continue.</p>
        
        
        <button 
          onClick={() => navigate('/login')}
          style={{
            padding: '14px 60px',
            fontSize: '18px',
            backgroundColor: '#0066cc',
            color: 'white',
            border: 'none',
            borderRadius: '50px',
            cursor: 'pointer',
            fontWeight: '600',
            boxShadow: '0 4px 12px rgba(0, 102, 204, 0.3)',
            transition: 'transform 0.2s, background-color 0.2s'
          }}
          onMouseOver={(e) => e.target.style.backgroundColor = '#0052a3'}
          onMouseOut={(e) => e.target.style.backgroundColor = '#0066cc'}
        >
          Login
        </button>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '40px', paddingBottom: '30px', borderBottom: '1px solid #e0e0e0' }}>
        <div>
          <h1 style={{ color: '#1a1a1a', margin: '0 0 5px 0' }}>Welcome, {userData.username}!</h1>
          <p style={{ color: '#999999', margin: '0', fontSize: '0.95em' }}>Driver Incentive Program</p>
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button 
            onClick={() => navigate('/password-reset')}
            style={{ padding: '10px 18px', background: '#f0f0f0', color: '#333333', border: '1px solid #d0d0d0', borderRadius: '6px', cursor: 'pointer', fontWeight: '500', fontSize: '0.95em', transition: 'background-color 0.2s' }}
          >
            Reset Password
          </button>
          <button 
            onClick={handleLogout}
            style={{ padding: '10px 18px', background: '#0066cc', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: '500', fontSize: '0.95em', transition: 'background-color 0.2s' }}
          >
            Logout
          </button>
        </div>
      </div>
      
      <div style={{ background: '#f9f9f9', padding: '30px', borderRadius: '8px', marginBottom: '30px', border: '1px solid #e0e0e0' }}>
        <h2 style={{ color: '#1a1a1a', marginTop: '0', marginBottom: '20px' }}>User Profile</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '20px' }}>
          <div>
            <p style={{ color: '#999999', fontSize: '0.9em', margin: '0 0 5px 0' }}>Email Address</p>
            <p style={{ color: '#1a1a1a', fontWeight: '600', margin: '0', fontSize: '1.05em' }}>{userData.email}</p>
          </div>
          <div>
            <p style={{ color: '#999999', fontSize: '0.9em', margin: '0 0 5px 0' }}>User ID</p>
            <p style={{ color: '#1a1a1a', fontWeight: '600', margin: '0', fontSize: '1.05em' }}>{userData.user_id}</p>
          </div>
        </div>
      </div>

      <div style={{ background: '#f0f7ff', padding: '30px', borderRadius: '8px', border: '1px solid #d0e3ff' }}>
        <h3 style={{ color: '#1a1a1a', marginTop: '0', marginBottom: '12px' }}>About the Driver Incentive Program</h3>
        <p style={{ color: '#666666', margin: '0', lineHeight: '1.6' }}>
          This dashboard is where you can manage your driver profile, view your points balance, and browse available rewards. Your participation helps incentivize safe driving practices across the transportation industry.
        </p>
        <p style={{ color: '#999999', fontSize: '0.9em', margin: '15px 0 0 0', fontStyle: 'italic' }}>Additional features coming soon</p>
      </div>
    </div>
  );
};

export default Home;
