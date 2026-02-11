import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

const PasswordReset = () => {
  const [step, setStep] = useState(1); // Step 1: Request token, Step 2: Confirm reset
  const [email, setEmail] = useState('');
  const [token, setToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    // Pre-fill email if user is logged in
    const storedUser = localStorage.getItem('user') || sessionStorage.getItem('user');
    if (storedUser) {
      const user = JSON.parse(storedUser);
      setEmail(user.email);
    }
  }, []);

  const handleRequestToken = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');
    setLoading(true);

    try {
      const response = await fetch('/api/password-reset/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });

      const data = await response.json();

      if (response.ok) {
        setMessage('Reset token sent! Check the token below or use the one returned.');
        setToken(data.token);
        setStep(2);
      } else {
        setError(data.message || 'Failed to request reset token');
      }
    } catch (err) {
      console.error('Error:', err);
      setError('Could not connect to server');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmReset = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setLoading(true);

    try {
      const response = await fetch('/api/password-reset/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, newPassword })
      });

      const data = await response.json();

      if (response.ok) {
        setMessage('Password reset successfully! Logging you out and redirecting to login...');
        // Clear user data and redirect to login
        localStorage.removeItem('user');
        sessionStorage.removeItem('user');
        // Dispatch event to notify app of logout
        window.dispatchEvent(new Event('authStateChanged'));
        setTimeout(() => navigate('/login'), 2000);
      } else {
        setError(data.message || 'Failed to reset password');
      }
    } catch (err) {
      console.error('Error:', err);
      setError('Could not connect to server');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: '480px', margin: '60px auto', padding: '40px', background: '#ffffff', borderRadius: '8px', border: '1px solid #e0e0e0', boxShadow: '0 1px 3px rgba(0, 0, 0, 0.08)' }}>
      <h2 style={{ textAlign: 'center', color: '#1a1a1a', marginBottom: '30px', fontSize: '1.8em' }}>Reset Password</h2>

      {message && (
        <div style={{ padding: '15px', marginBottom: '20px', background: '#ecfdf5', color: '#065f46', borderRadius: '6px', border: '1px solid #d1fae5', fontSize: '0.95em' }}>
          {message}
        </div>
      )}

      {error && (
        <div style={{ padding: '15px', marginBottom: '20px', background: '#fef2f2', color: '#991b1b', borderRadius: '6px', border: '1px solid #fee2e2', fontSize: '0.95em' }}>
          {error}
        </div>
      )}

      {step === 1 ? (
        <form onSubmit={handleRequestToken}>
          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', color: '#1a1a1a', fontSize: '0.95em' }}>Email Address</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={{ width: '100%', padding: '12px', boxSizing: 'border-box', borderRadius: '6px', border: '1px solid #d0d0d0', fontSize: '1em', fontFamily: 'inherit' }}
              required
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              padding: '12px',
              background: '#0066cc',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.7 : 1,
              fontWeight: '600',
              fontSize: '1em',
              transition: 'background-color 0.2s'
            }}
          >
            {loading ? 'Requesting...' : 'Request Reset Token'}
          </button>
          <button
            type="button"
            onClick={() => navigate('/')}
            style={{
              width: '100%',
              padding: '12px',
              marginTop: '10px',
              background: '#f0f0f0',
              color: '#333333',
              border: '1px solid #d0d0d0',
              borderRadius: '6px',
              cursor: 'pointer',
              fontWeight: '600',
              fontSize: '1em',
              transition: 'background-color 0.2s'
            }}
          >
            Cancel
          </button>
        </form>
      ) : (
        <form onSubmit={handleConfirmReset}>
          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', color: '#1a1a1a', fontSize: '0.95em' }}>Reset Token</label>
            <input
              type="text"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              style={{ width: '100%', padding: '12px', boxSizing: 'border-box', borderRadius: '6px', border: '1px solid #d0d0d0', fontSize: '1em', fontFamily: 'inherit' }}
              required
            />
            <small style={{ color: '#999999', display: 'block', marginTop: '6px', fontSize: '0.9em' }}>Paste the token received from the previous step</small>
          </div>

          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', color: '#1a1a1a', fontSize: '0.95em' }}>New Password</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <input
                type={showPassword ? 'text' : 'password'}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                style={{ flex: 1, padding: '12px', borderRadius: '6px', border: '1px solid #d0d0d0', fontSize: '1em', fontFamily: 'inherit' }}
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                style={{
                  padding: '10px 16px',
                  background: '#f0f0f0',
                  color: '#333333',
                  border: '1px solid #d0d0d0',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontWeight: '500',
                  fontSize: '0.9em',
                  transition: 'background-color 0.2s'
                }}
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
            <small style={{ color: '#999999', display: 'block', marginTop: '6px', fontSize: '0.9em' }}>Min 8 chars, uppercase, number, special char (!@#$%^&*)</small>
          </div>

          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', color: '#1a1a1a', fontSize: '0.95em' }}>Confirm Password</label>
            <input
              type={showPassword ? 'text' : 'password'}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              style={{ width: '100%', padding: '12px', boxSizing: 'border-box', borderRadius: '6px', border: '1px solid #d0d0d0', fontSize: '1em', fontFamily: 'inherit' }}
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              padding: '12px',
              background: '#0066cc',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.7 : 1,
              fontWeight: '600',
              fontSize: '1em',
              transition: 'background-color 0.2s'
            }}
          >
            {loading ? 'Resetting...' : 'Confirm Password Reset'}
          </button>
          <button
            type="button"
            onClick={() => setStep(1)}
            style={{
              width: '100%',
              padding: '12px',
              marginTop: '10px',
              background: '#f0f0f0',
              color: '#333333',
              border: '1px solid #d0d0d0',
              borderRadius: '6px',
              cursor: 'pointer',
              fontWeight: '600',
              fontSize: '1em',
              transition: 'background-color 0.2s'
            }}
          >
            Back
          </button>
        </form>
      )}
    </div>
  );
};

export default PasswordReset;
