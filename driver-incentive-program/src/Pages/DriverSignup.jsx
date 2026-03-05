import React, { useState } from 'react';
import InputField from '../components/InputField';
import { signUpUser } from '../api/UserApi';
import { useNavigate } from 'react-router-dom';

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

    const navigate = useNavigate();

    const handleSubmit = async (e) => {
        e.preventDefault();
        setUsed(true);
        if (!error) {
            const response = await signUpUser({ firstName, lastName, phoneNumber, email, username, password, orgId: null }, 'driver');
            if (response === 'success') {
                alert('Signup successful! Please log in.');
                navigate('/login');
            }
        }
    }

    return(
        <div style={{ maxWidth: '440px', margin: '60px auto', padding: '40px', background: '#ffffff', borderRadius: '8px', border: '1px solid #e0e0e0', boxShadow: '0 1px 3px rgba(0, 0, 0, 0.08)' }}>
            <h2 style={{ textAlign: 'center', color: '#1a1a1a', marginBottom: '30px', fontSize: '1.8em' }}>Sign Up</h2>
            <form onSubmit={handleSubmit}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    {error && used && (
                        <span style={{ 
                            color: '#b81515', 
                            fontSize: '0.85em', 
                            marginTop: '2px',
                        }}>
                            An error is preventing you from signing up. Please check your information and try again.
                        </span>
                    )}
                    <InputField
                        label="First Name"
                        variant="auth"
                        required={true}
                        value={firstName}
                        onChange={(value) => setFirstName(value)}
                        validate={(value) => {
                            setError(true);
                            if (value === '') return 'First name is required';
                            if (!/^[A-Za-z]+$/.test(value)) return 'First name must contain only letters';
                            setError(false);
                            return null
                        }}
                    />
                    <InputField
                        label="Last Name"
                        variant="auth"
                        required={true}
                        value={lastName}
                        onChange={(value) => setLastName(value)}
                        validate={(value) => {
                            setError(true);
                            if (value === '') return 'Last name is required';
                            if (!/^[A-Za-z]+$/.test(value)) return 'Last name must contain only letters';
                            setError(false);
                            return '';
                        }}
                    />
                    <InputField
                        label="Phone Number"
                        variant="auth"
                        required={true}
                        value={phoneNumber}
                        onChange={(value) => setPhoneNumber(value)}
                        validate={(value) => {
                            const digitsOnly = value.replace(/\D/g, '');
                            if (value === '') return 'Phone number is required';
                            return /^\d{10}$/.test(digitsOnly) ? '' : 'Phone number must be 10 digits';
                            return '';
                        }}
                    />
                    <InputField
                        label="Email Address"
                        type="email" 
                        variant="auth"
                        required={true}
                        value={email}
                        onChange={(value) => setEmail(value)}
                        validate={(value) => {
                            if (value === '') return 'Email is required';
                            if (!value.includes('@')) {
                                return "Email must contain @";
                            }
                            const validEndings = ['.com', '.edu', '.org'];
                            if (!validEndings.some(ending => value.toLowerCase().endsWith(ending))) {
                                return "Email must end with a valid domain of .com, .edu, or .org";
                            }
                            return '';
                        }}
                    />
                    <InputField
                        label="Username"
                        variant="auth"
                        required={true}
                        value={username}
                        onChange={(value) => setUsername(value)}
                        validate={(value) => {
                            if (value === '') return 'Username is required';
                            if (value.length < 3) return 'Username must be at least 3 characters long';
                            if (!/^[a-zA-Z0-9_]+$/.test(value)) return 'Username must contain only letters, numbers, and underscores';
                            return '';
                        }}
                    />
                    <InputField
                        label="Password"
                        type="password"
                        variant="auth"
                        required={true}
                        value={password}
                        onChange={(value) => setPassword(value)}
                        validate={(value) => {
                            if (value === '') return 'Password is required';
                            if (value.length < 8) return 'Password must be at least 8 characters long';
                            if (!/[A-Z]/.test(value)) return 'Password must contain at least one uppercase letter';
                            if (!/[0-9]/.test(value)) return 'Password must contain at least one number';
                            if (!/[!@#$%^&*(),.?":{}|<>]/.test(value)) return 'Password must contain at least one special character';
                            return '';
                        }}
                    />
                    <InputField
                        label="Confirm Password"
                        type="password"
                        variant="auth"
                        required={true}
                        value={confirmPassword}
                        onChange={(value) => setConfirmPassword(value)}
                        validate={(value) => {
                            if (value === '') return 'Password is required';
                            if (value.length < 8) return 'Password must be at least 8 characters long';
                            if (!/[A-Z]/.test(value)) return 'Password must contain at least one uppercase letter';
                            if (!/[0-9]/.test(value)) return 'Password must contain at least one number';
                            if (!/[!@#$%^&*(),.?":{}|<>]/.test(value)) return 'Password must contain at least one special character';
                            if (value !== password) return 'Passwords do not match';
                            return '';
                        }}
                    />
                    <button type="submit" style={{ width: '100%', padding: '12px', background: '#0066cc', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: '600', fontSize: '1em', transition: 'background-color 0.2s' }}>
                        Sign Up
                    </button>
                </div>
            </form>
        </div>
    );
}

export default DriverSignup;