import React from 'react';
import TabGroup from '../../../components/TabGroup';
import AuditLogsTab from '../AuditLogsTab';
import Sales from './Sales';
import ActivityReportTab from './ActivityReportTab';
import Invoice from './Invoice';
import AdminStatisticsTab from './AdminStatisticsTab';
import AdminStabilityTab from './AdminStabilityTab';

const AdminReport = () => {
    const [userData, setUserData] = React.useState(() => {
        const storedUser = localStorage.getItem('user') || sessionStorage.getItem('user');
        return storedUser ? JSON.parse(storedUser) : null;
    });

    return (
        <div>
            <TabGroup
                tabs={[
                    { label: "Sales By Driver/Sponsor", content: <Sales/> },
                    { label: "Invoice", content: <Invoice/> },
                    { label: "Audit Logs", content: <AuditLogsTab/> },
                    { label: "Activity Report", content: <ActivityReportTab/> },
                    { label: "Statistics", content: <AdminStatisticsTab/> },
                    { label: "System Stability", content: <AdminStabilityTab/> },
                ]}
            />
        </div>
    );
}

export default AdminReport;