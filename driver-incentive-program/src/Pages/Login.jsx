import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // 2FA state (only used when the server says 2FA is required)
  const [requiresTwoFa, setRequiresTwoFa] = useState(false); // switches the UI to step 2
  const [pendingUserId, setPendingUserId] = useState(null);  // need to send userId when verifying the code
  const [twoFaCode, setTwoFaCode] = useState('');            // code the server givesd to display
  const [twoFaInput, setTwoFaInput] = useState('');          // what the user types into input box

  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      const response = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, rememberMe })
      });

      const data = await response.json();

      if (response.ok) {
        // Server says 2FA is required — save the userId and code,
        // then switch the UI to the second step instead of navigating home
        if (data.requiresTwoFa) {
          setPendingUserId(data.userId);
          setTwoFaCode(data.twoFaCode); // display this code to the user
          setRequiresTwoFa(true);
          return;
        }

        // Normal login success (no 2FA)
        const userDataString = JSON.stringify(data.user);
        if (rememberMe) {
          localStorage.setItem('user', userDataString);
        } else {
          sessionStorage.setItem('user', userDataString);
        }

        // always use localStorage for lastActivityTime (crosstab sync)
        localStorage.setItem('lastActivityTime', Date.now().toString());

        // Dispatch event to notify app of login
        window.dispatchEvent(new Event('authStateChanged'));

        console.log("User Data:", data.user);
        navigate('/');
      } else {
        alert(data.message);
      }
    } catch (error) {
      console.error("Login error:", error);
      alert("Cant connect to server");
    }
  };

  // handles the second step (sends code the user typed to the server for verif.)
  // if code is correct, server returns user data and finish login process
  const handleTwoFaSubmit = async (e) => {
    e.preventDefault();

    try {
      const response = await fetch('/api/2fa/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // send userId so the server knows whose codes to check & the code
        body: JSON.stringify({ userId: pendingUserId, code: twoFaInput, rememberMe })
      });

      const data = await response.json();

      if (response.ok) {
        // same login success logic
        const userDataString = JSON.stringify(data.user);
        if (rememberMe) {
          localStorage.setItem('user', userDataString);
        } else {
          sessionStorage.setItem('user', userDataString);
        }

        localStorage.setItem('lastActivityTime', Date.now().toString());
        window.dispatchEvent(new Event('authStateChanged'));

        console.log("User Data:", data.user);
        navigate('/');
      } else {
        alert(data.message || data.error || '2FA verification failed');
      }
    } catch (error) {
      console.error("2FA verify error:", error);
      alert("Cant connect to server");
    }
  };

  if (requiresTwoFa) {
    return (
      <div style={{ maxWidth: '440px', margin: '60px auto', padding: '40px', background: '#ffffff', borderRadius: '8px', border: '1px solid #e0e0e0', boxShadow: '0 1px 3px rgba(0, 0, 0, 0.08)' }}>
        <h2 style={{ textAlign: 'center', color: '#1a1a1a', marginBottom: '30px', fontSize: '1.8em' }}>Two-Factor Authentication</h2>
        <p style={{ color: '#444444', marginBottom: '20px', fontSize: '0.95em' }}>
          Your account has 2FA enabled. Enter the code below to complete sign in.
        </p>
        <div style={{ background: '#f0f0f0', border: '1px solid #d0d0d0', borderRadius: '6px', padding: '14px', marginBottom: '24px', textAlign: 'center' }}>
          <span style={{ fontSize: '0.85em', color: '#666666' }}>Your 2FA code:</span>
          <div style={{ fontSize: '2em', fontWeight: '700', letterSpacing: '0.2em', color: '#1a1a1a', marginTop: '6px' }}>{twoFaCode}</div>
        </div>
        <form onSubmit={handleTwoFaSubmit}>
          <div style={{ marginBottom: '20px' }}>
            <input
              type="text"
              placeholder="Enter 6-digit code"
              value={twoFaInput}
              onChange={(e) => setTwoFaInput(e.target.value)}
              maxLength={6}
              style={{ width: '100%', padding: '12px', fontSize: '1em', border: '1px solid #d0d0d0', borderRadius: '6px', boxSizing: 'border-box', fontFamily: 'inherit', textAlign: 'center', letterSpacing: '0.15em' }}
              required
            />
          </div>
          <button type="submit" style={{ width: '100%', padding: '12px', background: '#0066cc', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: '600', fontSize: '1em', transition: 'background-color 0.2s' }}>
            Verify
          </button>
        </form>
        <button
          onClick={() => { setRequiresTwoFa(false); setTwoFaCode(''); setTwoFaInput(''); setPendingUserId(null); }}
          style={{ marginTop: '16px', width: '100%', padding: '10px', background: 'none', color: '#0066cc', border: '1px solid #d0d0d0', borderRadius: '6px', cursor: 'pointer', fontSize: '0.9em' }}
        >
          Back to Sign In
        </button>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '440px', margin: '60px auto', padding: '40px', background: '#ffffff', borderRadius: '8px', border: '1px solid #e0e0e0', boxShadow: '0 1px 3px rgba(0, 0, 0, 0.08)' }}>
      <h2 style={{ textAlign: 'center', color: '#1a1a1a', marginBottom: '30px', fontSize: '1.8em' }}>Log In</h2>
      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: '20px' }}>
          <input
            type="email"
            placeholder="Email Address"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={{ width: '100%', padding: '12px', fontSize: '1em', border: '1px solid #d0d0d0', borderRadius: '6px', boxSizing: 'border-box', fontFamily: 'inherit' }}
            required
          />
        </div>
        <div style={{ marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <input
              type={showPassword ? 'text' : 'password'}
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={{ flex: 1, padding: '12px', fontSize: '1em', border: '1px solid #d0d0d0', borderRadius: '6px', fontFamily: 'inherit' }}
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              style={{ padding: '10px 16px', background: '#f0f0f0', color: '#333333', border: '1px solid #d0d0d0', borderRadius: '6px', cursor: 'pointer', fontWeight: '500', fontSize: '0.9em', transition: 'background-color 0.2s' }}
              onHover={e => e.target.style.backgroundColor = '#e0e0e0'}
            >
              {showPassword ? 'Hide' : 'Show'}
            </button>
          </div>
        </div>
        <div style={{ marginBottom: '25px' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#666666', fontSize: '0.95em', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
              style={{ cursor: 'pointer', width: '16px', height: '16px' }}
            />
            Remember Me
          </label>
        </div>
        <div style={{ marginBottom: '25px' }}>
          <label onClick={() => navigate("/password-reset")} style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#666666', fontSize: '0.95em', cursor: 'pointer' }}>
            <span style={{color: "#1a73e8"}}>Forgot Password?</span>
          </label>
        </div>
        <button type="submit" style={{ width: '100%', padding: '12px', background: '#0066cc', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: '600', fontSize: '1em', transition: 'background-color 0.2s' }}>
          Log In
        </button>
      </form>
    </div>
  );
};

export default Login;
