import React from 'react';
import TabGroup from '../../../components/TabGroup';
import AuditLogsTab from '../AuditLogsTab';
import SalesByDriver from './SalesByDriver';
import SalesBySponsor from './SalesBySponsor';
import ActivityReportTab from './ActivityReportTab';
import Invoice from './Invoice';

const AdminReport = () => {
    const [userData, setUserData] = React.useState(() => {
        const storedUser = localStorage.getItem('user') || sessionStorage.getItem('user');
        return storedUser ? JSON.parse(storedUser) : null;
    });

    return (
        <div>
            <TabGroup
                tabs={[
                    { label: "Sales by Sponsor", content: <SalesBySponsor/> },
                    { label: "Sales by Driver", content: <SalesByDriver/> },
                    { label: "Invoice", content: <Invoice/> },
                    { label: "Audit Logs", content: <AuditLogsTab/> },
                    { label: "Activity Report", content: <ActivityReportTab/> }
                ]}
            />
        </div>
    );
}

export default AdminReport;