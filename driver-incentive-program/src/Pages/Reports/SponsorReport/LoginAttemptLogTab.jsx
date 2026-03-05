import React, { useState, useEffect } from 'react';
import SortableTable from '../../../components/SortableTable';
import { fetchLoginLogs } from '../../../api/SponsorLogsApi';

const LoginAttemptLogTab = ({ org_id }) => {
    const [logs, setLogs] = useState([]);

    async function fetchLogs() {
        const logs = await fetchLoginLogs(org_id);
        setLogs(logs);
    }

    useEffect(() => {
        if (org_id) {
            fetchLogs();
        }
    }, [org_id]);

    return (
        <div>
            <h2>Login Attempt Logs</h2>
            <SortableTable
                columns={[
                    { key: 'log_id', label: 'Log ID', sortable: true },
                    { key: 'user_id', label: 'User ID', sortable: true },
                    { key: 'username', label: 'Username', sortable: true },
                    { key: 'result', label: 'Result', sortable: true },
                    { key: 'login_date', label: 'Date', sortable: true },
                ]}
                data={logs || []}
            />
        </div>
    );
}

export default LoginAttemptLogTab;