import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import EditableField from '../components/EditableField';

async function saveField(email, field, value) {
    const response = await fetch('/api/user', {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, field, value }),
    });
    console.log("Saving field", { email, field, value });
    if (response.ok) {
        console.log('Field updated successfully');
    } else {
        console.error('Failed to update field');
    }
    
    if (localStorage.getItem('user')) {
        const updatedUser = { ...JSON.parse(localStorage.getItem('user')), [field]: value };
        localStorage.setItem('user', JSON.stringify(updatedUser));
    }
    else {
        const updatedUser = { ...JSON.parse(sessionStorage.getItem('user')), [field]: value };
        sessionStorage.setItem('user', JSON.stringify(updatedUser));
    }
}

const ProfileTab = ({ userData, setUserData, navigate }) => {
    const [driverData, setDriverData] = useState(null);

    useEffect(() => {
        if (userData?.user_type === 'driver' && userData?.user_id) {
            fetch(`/api/driver/${userData.user_id}`)
                .then(res => res.json())
                .then(data => {
                    if (data.driver) {
                        setDriverData(data.driver);
                    }
                })
        }
    }, [userData]);
    return (
        <div style={{ display: 'grid', direction: 'column'}}>
            <div style={{ background: '#f9f9f9',  paddingBottom: '30px', paddingLeft: '30px', paddingTop: '0px', borderRadius: '8px', border: '1px solid #e0e0e0' }}>
                <h2 style={{ color: '#1a1a1a', marginBottom: '20px' }}>Profile Information</h2>
                <div style={{ display:'grid', direction: 'row', gap: '20px', marginLeft: '24px' }}>
                    <EditableField 
                        label="Username"
                        value={userData?.username || "Not available"}
                        onSave={async (value) => {
                            await saveField(userData.email, "username", value);
                            setUserData(prev => ({ ...prev, username: value }));
                        }} 
                    />
                    <EditableField
                        label="Email"
                        value={userData?.email || "Not available"}
                        onSave={async (value) => {
                            await saveField(userData.email, "email", value);
                            setUserData(prev => ({ ...prev, email: value }));
                        }} 
                    />
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <b>Password: </b>
                        <span>**************</span>
                    </div>
                    <EditableField
                        label="Phone Number"
                        value={userData?.phone_number || "Not available"}
                        onSave={async (value) => {
                            await saveField(userData.email, "phone_number", value);
                            setUserData(prev => ({ ...prev, phone_number: value }));
                        }} 
                    />
                    <EditableField
                        label="First Name"
                        value={userData?.first_name || "Not available"}
                        onSave={async (value) => {
                            await saveField(userData.email, "first_name", value);
                            setUserData(prev => ({ ...prev, first_name: value }));
                        }} 
                    />
                    <EditableField
                        label="Last Name"
                        value={userData?.last_name || "Not available"}
                        onSave={async (value) => {
                            await saveField(userData.email, "last_name", value);
                            setUserData(prev => ({ ...prev, last_name: value }));
                        }} 
                    />
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <b>Role: </b>
                        <span>{userData?.user_type || "Not available"}</span>
                    </div>
                    {userData?.user_type === 'driver' && driverData?.affilated_at && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <b>Joined Sponsor: </b>
                            <span>
                                {new Date(driverData.affilated_at).toLocaleString('en-US', {
                                    year: 'numeric',
                                    month: '2-digit',
                                    day: '2-digit',
                                    hour: '2-digit',
                                    minute: '2-digit',
                                    hour12: true
                                })}
                            </span>
                        </div>
                    )}
                </div>
            </div>
            <div style={{ background: '#f9f9f9',  paddingBottom: '30px', paddingLeft: '30px', paddingTop: '0px', borderRadius: '8px', border: '1px solid #e0e0e0' }}>
                <h2 style={{ color: '#1a1a1a', marginBottom: '20px' }}>Profile Security</h2>
                <div style={{ display:'grid', direction: 'row', gap: '20px', marginLeft: '24px' }}>
                    <button
                        onClick={() => {
                            navigate('/password-reset');
                        }}
                        style={{
                            padding: '6px 20px',
                            fontSize: '14px',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            justifySelf: 'start',
                        }}
                    >
                        Reset Password
                    </button>
                </div>
            </div>
        </div>
    );
}

const OrganizationTab = () => {
    return (
        <div>

        </div>
    );
}

const Account = () => {
    const [userData, setUserData] = useState(() => {
        const storedUser = localStorage.getItem('user') || sessionStorage.getItem('user');
        return storedUser ? JSON.parse(storedUser) : null;
    });
    const [activeTab, setActiveTab] = useState('profile');
    const navigate = useNavigate();

    return (userData ? (
            <div style={{display: 'flex', minHeight: "100vh"}}>
                <div style={{width: '200px', borderRight: "1px solid #e0e0e0", padding: "0px" }}>
                    <button
                    style={{
                        display: "block",
                        width: "100%",
                        background: activeTab === "profile" ? "#007bff" : "#f0f0f0",
                        color: activeTab === "profile" ? "white" : "black",
                        padding: "10px",
                        borderTop: "1px solid #e0e0e0",
                        borderBottom: "1px solid #e0e0e0",
                        borderLeft: "1px solid #e0e0e0",
                        borderRadius: "0px",
                        cursor: "pointer"
                    }}
                    onClick={() => setActiveTab("profile")}
                    >
                        Profile
                    </button>
                    <button
                    style={{
                        display: "block",
                        width: "100%",
                        background: activeTab === "organization" ? "#007bff" : "#f0f0f0",
                        color: activeTab === "organization" ? "white" : "black",
                        padding: "10px",
                        borderBottom: "1px solid #e0e0e0",
                        borderLeft: "1px solid #e0e0e0",
                        borderRadius: "0px",
                        cursor: "pointer"
                    }}
                    onClick={() => setActiveTab("organization")}
                    >
                        Organization
                    </button>
                </div>
                <div style={{ flex: 1, paddingLeft: "24px" }}>
                    {activeTab === "profile" && ProfileTab({ userData, setUserData, navigate })}
                    {activeTab === "organization" && OrganizationTab()}
                </div>
            </div>
        ) : (
            <div>Please log in</div>
        )
    );
}

export default Account;