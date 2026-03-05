import React, { useState } from 'react';
import TabGroup from '../../../components/TabGroup';
import PasswordChangeLogTab from './PasswordChangeLogTab';
import DriverPointTrackingTab from './DriverPointTrackingTab';
import LoginAttemptLogTab from './LoginAttemptLogTab';
import DriverApplicationLogTab from './DriverApplicationLogTab';

const SponsorReport = () => {
    const [userData, setUserData] = useState(() => {
        const storedUser = localStorage.getItem('user') || sessionStorage.getItem('user');
        return storedUser ? JSON.parse(storedUser) : null;
    });

    return (
        <div>
            <TabGroup
                tabs={[
                    { label: "Driver Point Tracking", content: <DriverPointTrackingTab /> },
                    { label: "Password Change Logs", content: <PasswordChangeLogTab org_id={userData?.sponsor_org_id}/> },
                    { label: "Login Attempt Logs", content: <LoginAttemptLogTab org_id={userData?.sponsor_org_id} /> },
                    { label: "Driver Application Logs", content: <DriverApplicationLogTab /> },
                ]}
            />
        </div>
    );
}

export default SponsorReport;