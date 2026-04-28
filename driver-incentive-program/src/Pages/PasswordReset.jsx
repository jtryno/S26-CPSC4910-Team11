import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Button, FormField, Input, Alert } from '../components/ui';

const PasswordReset = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const initialParams = new URLSearchParams(location.search);
  const initialToken = initialParams.get('token') || '';
  const initialMode = initialParams.get('mode');

  const [step, setStep] = useState(initialToken ? 2 : 1);
  const [email, setEmail] = useState('');
  const [token, setToken] = useState(initialToken);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useState(
    initialToken && initialMode === 'onboarding'
      ? 'Set your password to finish activating your account.'
      : ''
  );
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
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
    window.resetInactivityTimer?.();
    try {
      const response = await fetch('/api/password-reset/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await response.json();
      if (response.ok) {
        setMessage(data.message || 'If an account exists for that email, a reset link has been sent.');
      } else {
        setError(data.message || data.error || 'Failed to request reset link');
      }
    } catch {
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
    window.resetInactivityTimer?.();
    try {
      const response = await fetch('/api/password-reset/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, newPassword }),
      });
      const data = await response.json();
      if (response.ok) {
        setMessage('Password reset successfully! Redirecting to login…');
        localStorage.removeItem('user');
        sessionStorage.removeItem('user');
        window.dispatchEvent(new Event('authStateChanged'));
        setTimeout(() => navigate('/login'), 2000);
      } else {
        setError(data.message || 'Failed to reset password');
      }
    } catch {
      setError('Could not connect to server');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-card">
      <h2 className="auth-card__title">Reset Password</h2>

      {message && <Alert tone="success" style={{ marginBottom: 'var(--space-5)' }}>{message}</Alert>}
      {error   && <Alert tone="danger"  style={{ marginBottom: 'var(--space-5)' }}>{error}</Alert>}

      {step === 1 ? (
        <form onSubmit={handleRequestToken} className="auth-card__form">
          <FormField label="Email Address" htmlFor="reset-email" required>
            <Input
              id="reset-email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </FormField>
          <Button type="submit" fullWidth size="lg" loading={loading}>
            Send Reset Link
          </Button>
          <Button type="button" variant="secondary" fullWidth onClick={() => navigate('/')}>
            Cancel
          </Button>
        </form>
      ) : (
        <form onSubmit={handleConfirmReset} className="auth-card__form">
          <FormField
            label="Reset Token"
            htmlFor="reset-token"
            hint="Paste the token from your reset link"
            required
          >
            <Input
              id="reset-token"
              type="text"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              required
            />
          </FormField>

          <FormField
            label="New Password"
            htmlFor="new-password"
            hint="Min 8 chars, uppercase, number, special character"
            required
          >
            <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
              <Input
                id="new-password"
                type={showPassword ? 'text' : 'password'}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
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

          <FormField label="Confirm Password" htmlFor="confirm-password" required>
            <Input
              id="confirm-password"
              type={showPassword ? 'text' : 'password'}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
            />
          </FormField>

          <Button type="submit" fullWidth size="lg" loading={loading}>
            Confirm Password Reset
          </Button>
          <Button type="button" variant="secondary" fullWidth onClick={() => setStep(1)}>
            Back
          </Button>
        </form>
      )}
    </div>
  );
};

export default PasswordReset;
