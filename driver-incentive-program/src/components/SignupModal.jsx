import React, { useEffect } from 'react';
import InputField from './InputField';
import { signUpUser } from '../api/UserApi';
import Modal from './Modal';
import DropdownField from './DropdownField';

const SignupModal = ({ isOpen, onClose, onSave, possibleRoles, orgs, orgId }) => {
    const [firstName, setFirstName] = React.useState('');
    const [lastName, setLastName] = React.useState('');
    const [phoneNumber, setPhoneNumber] = React.useState('');
    const [email, setEmail] = React.useState('');
    const [username, setUsername] = React.useState('');
    const [password, setPassword] = React.useState('');
    const [confirmPassword, setConfirmPassword] = React.useState('');
    const [role, setRole] = React.useState('');
    const [selectedOrgId, setSelectedOrgId] = React.useState(orgs ? orgs[0]?.value || null : orgId);
    const [error, setError] = React.useState(false);
    const [used, setUsed] = React.useState(false);

    const handleClose = () => {
        onClose();
        setFirstName('');
        setLastName('');
        setPhoneNumber('');
        setEmail('');
        setUsername('');
        setPassword('');
        setConfirmPassword('');
        setError(false);
        setUsed(false);
    }

    return (
        <Modal
            isOpen={isOpen}
            onClose={() => handleClose()}
            onSave={() => {
                setUsed(true);
                if (onSave) onSave();
                handleClose();
                if (!error) {
                    signUpUser({firstName, lastName, phoneNumber, email, username, password, orgId: role !== 'admin' ? selectedOrgId : null}, role);
                    onClose();
                }
            }}
            title="Sign Up"
            children={
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
                    <DropdownField
                        label="Role"
                        options={possibleRoles}
                        onChange={(value) => setRole(value)}
                    />
                    {
                        role !== 'admin' && orgs?.length > 0 && (
                            <DropdownField
                                label="Organization"
                                options={role === 'driver' ? [
                                    { label: 'None', value: null },
                                    ...orgs
                                ] :
                                    orgs
                                }
                                onChange={(value) => {
                                    const corrected = value === 'None' ? null : value;
                                    setSelectedOrgId(corrected);
                                }}
                            />
                        )
                    }
                </div>
            }
        />
    );
}

export default SignupModal;