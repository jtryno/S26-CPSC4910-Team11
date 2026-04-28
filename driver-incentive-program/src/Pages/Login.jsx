import React, { useState } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { Button, FormField, Input, Alert } from '../components/ui';

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');

  const [requiresTwoFa, setRequiresTwoFa] = useState(false);
  const [pendingUserId, setPendingUserId] = useState(null);
  const [twoFaCode, setTwoFaCode] = useState('');
  const [twoFaInput, setTwoFaInput] = useState('');
  const [loading, setLoading] = useState(false);

  const navigate = useNavigate();
  const location = useLocation();
  const successMessage = location.state?.message || '';

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const response = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, rememberMe }),
      });
      const data = await response.json();
      if (response.ok) {
        if (data.requiresTwoFa) {
          setPendingUserId(data.userId);
          setTwoFaCode(data.twoFaCode);
          setRequiresTwoFa(true);
          setLoading(false);
          return;
        }
        const userDataString = JSON.stringify(data.user);
        if (rememberMe) {
          localStorage.setItem('user', userDataString);
        } else {
          sessionStorage.setItem('user', userDataString);
        }
        localStorage.setItem('lastActivityTime', Date.now().toString());
        window.dispatchEvent(new Event('authStateChanged'));
        navigate('/');
      } else {
        setError(data.message || 'Login failed. Please check your credentials.');
      }
    } catch {
      setError('Cannot connect to server. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleTwoFaSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const response = await fetch('/api/2fa/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: pendingUserId, code: twoFaInput, rememberMe }),
      });
      const data = await response.json();
      if (response.ok) {
        const userDataString = JSON.stringify(data.user);
        if (rememberMe) {
          localStorage.setItem('user', userDataString);
        } else {
          sessionStorage.setItem('user', userDataString);
        }
        localStorage.setItem('lastActivityTime', Date.now().toString());
        window.dispatchEvent(new Event('authStateChanged'));
        navigate('/');
      } else {
        setError(data.message || data.error || '2FA verification failed.');
      }
    } catch {
      setError('Cannot connect to server. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (requiresTwoFa) {
    return (
      <div className="auth-card">
        <h2 className="auth-card__title">Two-Factor Authentication</h2>
        <p style={{ color: 'var(--color-text-muted)', fontSize: 'var(--font-size-sm)', marginBottom: 'var(--space-5)' }}>
          Your account has 2FA enabled. Enter the code below to complete sign in.
        </p>

        <div style={{
          background: 'var(--color-surface-alt)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-lg)',
          padding: 'var(--space-4)',
          textAlign: 'center',
          marginBottom: 'var(--space-6)',
        }}>
          <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', margin: '0 0 var(--space-1)' }}>
            Your 2FA code
          </p>
          <p style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 'var(--font-weight-bold)', letterSpacing: '0.2em', color: 'var(--color-text)', margin: 0 }}>
            {twoFaCode}
          </p>
        </div>

        {error && <Alert tone="danger" className="auth-card__form" style={{ marginBottom: 'var(--space-4)' }}>{error}</Alert>}

        <form onSubmit={handleTwoFaSubmit} className="auth-card__form">
          <FormField label="Verification Code" htmlFor="tfa-code" required>
            <Input
              id="tfa-code"
              type="text"
              placeholder="Enter 6-digit code"
              value={twoFaInput}
              onChange={(e) => setTwoFaInput(e.target.value)}
              maxLength={6}
              style={{ textAlign: 'center', letterSpacing: '0.2em', fontSize: 'var(--font-size-lg)' }}
              required
            />
          </FormField>
          <Button type="submit" fullWidth loading={loading}>Verify</Button>
          <Button
            type="button"
            variant="secondary"
            fullWidth
            onClick={() => { setRequiresTwoFa(false); setTwoFaCode(''); setTwoFaInput(''); setPendingUserId(null); }}
          >
            Back to Sign In
          </Button>
        </form>
      </div>
    );
  }

  return (
    <div className="auth-card">
      <h2 className="auth-card__title">Log In</h2>

      {successMessage && <Alert tone="success" style={{ marginBottom: 'var(--space-5)' }}>{successMessage}</Alert>}
      {error && <Alert tone="danger" style={{ marginBottom: 'var(--space-5)' }}>{error}</Alert>}

      <form onSubmit={handleSubmit} className="auth-card__form">
        <FormField label="Email Address" htmlFor="login-email" required>
          <Input
            id="login-email"
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </FormField>

        <FormField label="Password" htmlFor="login-password" required>
          <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
            <Input
              id="login-password"
              type={showPassword ? 'text' : 'password'}
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <button
              type="button"
              className="ui-btn ui-btn--secondary ui-btn--md"
              style={{ flexShrink: 0 }}
              onClick={() => setShowPassword(!showPassword)}
            >
              {showPassword ? 'Hide' : 'Show'}
            </button>
          </div>
        </FormField>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 'var(--font-size-sm)' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', color: 'var(--color-text-muted)', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
              style={{ width: 16, height: 16, cursor: 'pointer' }}
            />
            Remember me
          </label>
          <Link to="/password-reset" style={{ color: 'var(--color-primary)', fontSize: 'var(--font-size-sm)' }}>
            Forgot password?
          </Link>
        </div>

        <Button type="submit" fullWidth loading={loading} size="lg">Log In</Button>
      </form>

      <div className="auth-card__footer">
        Don't have an account?{' '}
        <Link to="/driver-signup">Sign up</Link>
      </div>
    </div>
  );
};

export default Login;
