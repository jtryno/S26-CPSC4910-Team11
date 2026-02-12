import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
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
        // Store user data in localStorage (if remember me) or sessionStorage
        const userDataString = JSON.stringify(data.user);
        if (rememberMe) {
          localStorage.setItem('user', userDataString);
        } else {
          sessionStorage.setItem('user', userDataString);
        }

        // always use localStorage for lastActivityTime ((crosstab sync)
        localStorage.setItem('lastActivityTime', Date.now().toString());

        // Dispatch event to notify app of login
        window.dispatchEvent(new Event('authStateChanged'));

        console.log("User Data:", data.user);
        // Redirect to home page
        navigate('/');
      } else {
        alert(data.message);
      }
    } catch (error) {
      console.error("Login error:", error);
      alert("Cant connect to server");
    }
  };

  return (
    <div style={{ maxWidth: '440px', margin: '60px auto', padding: '40px', background: '#ffffff', borderRadius: '8px', border: '1px solid #e0e0e0', boxShadow: '0 1px 3px rgba(0, 0, 0, 0.08)' }}>
      <h2 style={{ textAlign: 'center', color: '#1a1a1a', marginBottom: '30px', fontSize: '1.8em' }}>Sign In</h2>
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
        <button type="submit" style={{ width: '100%', padding: '12px', background: '#0066cc', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: '600', fontSize: '1em', transition: 'background-color 0.2s' }}>
          Sign In
        </button>
      </form>
    </div>
  );
};

export default Login;