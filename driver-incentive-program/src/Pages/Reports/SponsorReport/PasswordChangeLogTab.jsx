import React, { useEffect, useState } from 'react';
import SortableTable from '../../../components/SortableTable';
import { fetchPasswordChangeLogs } from '../../../api/SponsorLogsApi';

const PasswordChangeLogTab = ({ org_id }) => {
    const [logs, setLogs] = useState([]);
    
    async function fetchLogs() {
        const logs = await fetchPasswordChangeLogs(org_id);
        setLogs(logs);
    }
    
    useEffect(() => {
        if (org_id) {
            fetchLogs();
        }
    }, [org_id])

    return (
        <div>
            <h2>Password Change Logs</h2>
            <SortableTable 
                columns={[
                    { key: 'log_id', label: 'Log ID', sortable: true },
                    { key: 'user_id', label: 'User ID', sortable: true },
                    { key: 'username', label: 'Username', sortable: true },
                    { key: 'change_type', label: 'Change Type', sortable: true },
                    { key: 'created_at', label: 'Date', sortable: true },
                ]}
                data={logs || []}
            />
        </div>
    );
}

export default PasswordChangeLogTab;