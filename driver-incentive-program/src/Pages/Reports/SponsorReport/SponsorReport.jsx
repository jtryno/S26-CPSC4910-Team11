import React, { useState } from 'react';
import TabGroup from '../../../components/TabGroup';
import DriverPointTrackingTab from './DriverPointTrackingTab';
import AuditLogsTab from '../AuditLogsTab';

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
                    { label: "Audit Logs", content: <AuditLogsTab orgId={userData?.sponsor_org_id} /> }
                ]}
            />
        </div>
    );
}

export default SponsorReport;