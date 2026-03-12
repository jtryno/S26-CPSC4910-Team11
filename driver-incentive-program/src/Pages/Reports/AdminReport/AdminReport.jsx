import React from 'react';
import TabGroup from '../../../components/TabGroup';
import AuditLogsTab from '../AuditLogsTab';

const AdminReport = () => {
    const [userData, setUserData] = React.useState(() => {
        const storedUser = localStorage.getItem('user') || sessionStorage.getItem('user');
        return storedUser ? JSON.parse(storedUser) : null;
    });

    return (
        <div>
            <TabGroup
                tabs={[
                    { label: "Sales by Sponsor", content: <div>content goes here</div>},
                    { label: "Sales by Driver", content: <div>content goes here</div>},
                    { label: "Invoice", content: <div>content goes here</div>},
                    { label: "Audit Logs", content: <AuditLogsTab/> }
                ]}
            />
        </div>
    );
}

export default AdminReport;