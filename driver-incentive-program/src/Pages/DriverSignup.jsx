import React, { useState } from 'react';
import InputField from '../components/InputField';
import { Button, Alert } from '../components/ui';
import { signUpUser } from '../api/UserApi';
import { useNavigate, Link } from 'react-router-dom';

const DriverSignup = () => {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState(false);
  const [used, setUsed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [apiError, setApiError] = useState('');

  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setUsed(true);
    if (!error) {
      setApiError('');
      setLoading(true);
      try {
        const response = await signUpUser(
          { firstName, lastName, phoneNumber, email, username, password, orgId: null },
          'driver'
        );
        if (response === 'success') {
          navigate('/login', { state: { message: 'Signup successful! Please log in.' } });
        } else {
          setApiError(response?.message || 'Signup failed. That email or username may already be taken.');
        }
      } catch {
        setApiError('Cannot connect to server. Please try again.');
      } finally {
        setLoading(false);
      }
    }
  };

  return (
    <div className="auth-card" style={{ maxWidth: '500px' }}>
      <h2 className="auth-card__title">Create Account</h2>

      {error && used && (
        <Alert tone="danger" style={{ marginBottom: 'var(--space-5)' }}>
          Please fix the errors below before continuing.
        </Alert>
      )}
      {apiError && (
        <Alert tone="danger" style={{ marginBottom: 'var(--space-5)' }}>{apiError}</Alert>
      )}

      <form onSubmit={handleSubmit} className="auth-card__form">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)' }}>
          <InputField
            label="First Name"
            variant="auth"
            required
            value={firstName}
            onChange={(value) => setFirstName(value)}
            validate={(value) => {
              setError(true);
              if (value === '') return 'First name is required';
              if (!/^[A-Za-z]+$/.test(value)) return 'Letters only';
              setError(false);
              return null;
            }}
          />
          <InputField
            label="Last Name"
            variant="auth"
            required
            value={lastName}
            onChange={(value) => setLastName(value)}
            validate={(value) => {
              setError(true);
              if (value === '') return 'Last name is required';
              if (!/^[A-Za-z]+$/.test(value)) return 'Letters only';
              setError(false);
              return '';
            }}
          />
        </div>
        <InputField
          label="Phone Number"
          variant="auth"
          required
          value={phoneNumber}
          onChange={(value) => setPhoneNumber(value)}
          validate={(value) => {
            const digitsOnly = value.replace(/\D/g, '');
            if (value === '') return 'Phone number is required';
            return /^\d{10}$/.test(digitsOnly) ? '' : 'Must be 10 digits';
          }}
        />
        <InputField
          label="Email Address"
          type="email"
          variant="auth"
          required
          value={email}
          onChange={(value) => setEmail(value)}
          validate={(value) => {
            if (value === '') return 'Email is required';
            if (!value.includes('@')) return 'Must contain @';
            if (!['.com', '.edu', '.org'].some(e => value.toLowerCase().endsWith(e)))
              return 'Must end with .com, .edu, or .org';
            return '';
          }}
        />
        <InputField
          label="Username"
          variant="auth"
          required
          value={username}
          onChange={(value) => setUsername(value)}
          validate={(value) => {
            if (value === '') return 'Username is required';
            if (value.length < 3) return 'At least 3 characters';
            if (!/^[a-zA-Z0-9_]+$/.test(value)) return 'Letters, numbers, and underscores only';
            return '';
          }}
        />
        <InputField
          label="Password"
          type="password"
          variant="auth"
          required
          value={password}
          onChange={(value) => setPassword(value)}
          validate={(value) => {
            if (value === '') return 'Password is required';
            if (value.length < 8) return 'At least 8 characters';
            if (!/[A-Z]/.test(value)) return 'Needs an uppercase letter';
            if (!/[0-9]/.test(value)) return 'Needs a number';
            if (!/[!@#$%^&*(),.?":{}|<>]/.test(value)) return 'Needs a special character';
            return '';
          }}
        />
        <InputField
          label="Confirm Password"
          type="password"
          variant="auth"
          required
          value={confirmPassword}
          onChange={(value) => setConfirmPassword(value)}
          validate={(value) => {
            if (value === '') return 'Please confirm your password';
            if (value !== password) return 'Passwords do not match';
            return '';
          }}
        />
        <Button type="submit" fullWidth size="lg" loading={loading}>
          Create Account
        </Button>
      </form>

      <div className="auth-card__footer">
        Already have an account?{' '}
        <Link to="/login">Log in</Link>
      </div>
    </div>
  );
};

export default DriverSignup;
