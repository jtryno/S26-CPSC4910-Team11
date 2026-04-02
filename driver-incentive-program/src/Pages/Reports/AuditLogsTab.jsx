import React, { useState, useEffect } from 'react';
import SortableTable from '../../components/SortableTable';
import DropdownField from '../../components/DropdownField';
import DatePicker from '../../components/DatePicker';
import { fetchOrganizations, fetchOrgPointChanges } from '../../api/OrganizationApi';
import { fetchApplicationsOrg } from '../../api/ApplicationApi';
import { fetchPasswordChangeLogs, fetchLoginLogs } from '../../api/AuditLogApi';
 
const logTypes = {
    password_change: {
        label: "Password Change",
        columns: [
            { key: 'log_id', label: 'Log ID', sortable: true },
            { key: 'user_id', label: 'User ID', sortable: true },
            { key: 'username', label: 'Username', sortable: true },
            { key: 'change_type', label: 'Change Type', sortable: true },
            { key: 'created_at', label: 'Date', sortable: true },
        ],
        fetchFunction: fetchPasswordChangeLogs
    },
    login_attempt: {
        label: "Login Attempt",
        columns: [
            { key: 'log_id', label: 'Log ID', sortable: true },
            { key: 'user_id', label: 'User ID', sortable: true },
            { key: 'username', label: 'Username', sortable: true },
            { key: 'result', label: 'Result', sortable: true },
            { key: 'login_date', label: 'Date', sortable: true },
        ],
        fetchFunction: fetchLoginLogs
    },
    driver_application: {
        label: "Driver Application",
        columns: [
            { key: 'application_id', label: 'Log ID', sortable: true },
            { key: 'driver_user_id', label: 'User ID', sortable: true },
            { key: 'sponsor_org_id', label: 'Org ID', sortable: true },
            { key: 'status', label: 'Status', sortable: true },
            { key: 'decision_reason', label: 'Reason', sortable: false },
            { key: 'applied_at', label: 'Applied At', sortable: true },
            { key: 'reviewed_at', label: 'Reviewed At', sortable: true },
            { key: 'reviewed_by_user_id', label: 'Reviewer ID', sortable: true },
        ],
        fetchFunction: fetchApplicationsOrg
    },
    point_change: {
        label: "Point Change",
        columns: [
            { key: 'transaction_id', label: 'Log ID', sortable: true },
            { key: 'driver_user_id', label: 'User ID', sortable: true },
            { key: 'sponsor_org_id', label: 'Org ID', sortable: true },
            { key: 'point_amount', label: 'Point Amount', sortable: true },
            { key: 'reason', label: 'Reason', sortable: false },
            { key: 'source', label: 'Source', sortable: true },
            { key: 'created_at', label: 'Date', sortable: true },
            { key: 'created_by_user_id', label: 'Creator ID', sortable: true },
        ],
        fetchFunction: fetchOrgPointChanges
    }
};

const AuditLogsTab = ({ orgId }) => {
    const [logs, setLogs] = useState([]);
    const [logType, setLogType] = useState('password_change');
    const [fromDate, setFromDate] = useState(null);
    const [toDate, setToDate] = useState(null);
    const [selectedOrg, setSelectedOrg] = useState(orgId || null);
    const [organizations, setOrganizations] = useState([]);
    const [dateRange, setDateRange] = useState(false);

    async function fetchLogs() {
        const data = await logTypes[logType]?.fetchFunction(selectedOrg, {fromDate, toDate});
        setLogs(data);
        const orgs = await fetchOrganizations();
        setOrganizations(orgs);
    }

    useEffect(() => {
        fetchLogs();
    }, [logType, selectedOrg, fromDate, toDate]);

    useEffect(() => {
       setSelectedOrg(orgId || null);
    }, [orgId]);

    return (
        <div>
            <h3>Filters</h3>
            <div 
                style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: "20px",
                    padding: "15px",
                    border: "1px solid #ddd",
                    borderRadius: "8px",
                    background: "#f9f9f9"
                }}
            >
                <DropdownField
                    label="Log Type"
                    options={Object.entries(logTypes).map(([key, value]) => ({ value: key, label: value.label }))}
                    value={logType}
                    onChange={(value) => setLogType(value)}
                />
                <div style={{ gridColumn: "1 / span 2" }}>
                    <button
                        style={{ width: '75px', height: '20px', marginRight: '10px', justifyContent: 'center', alignItems: 'center', display: 'flex', fontSize: '12px' }}
                        onClick={() => {
                            setDateRange(!dateRange);
                            setToDate("");
                        }}
                    >
                        {!dateRange ? "Single" : "Range"}
                    </button>
                    <DatePicker
                        label={dateRange ? "From" : "Date"}
                        value={fromDate}
                        onChange={setFromDate}
                    />
                    {dateRange &&
                        <DatePicker
                            label="To"
                            value={toDate}
                            onChange={setToDate}
                        />
                    }
                </div>
                {!orgId &&
                    <DropdownField
                        label="Organization"
                        options={[{ label: 'All', value: null }, 
                        ...organizations.map(org => ({
                            label: org.name,
                            value: org.sponsor_org_id,
                        }))]}
                        value={selectedOrg}
                        onChange={setSelectedOrg}
                    />
                }
            </div>
            <h2>{logTypes[logType || 'password_change']?.label} Logs</h2>
            <SortableTable
                columns={logTypes[logType || 'password_change']?.columns || []}
                data={logs || []}
            />
        </div>
    );
}

export default AuditLogsTab;