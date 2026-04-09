import React, { useState, useEffect } from 'react';
import SortableTable from '../../../components/SortableTable';
import DropdownField from '../../../components/DropdownField';
import DatePicker from '../../../components/DatePicker';
import { fetchOrganizations } from '../../../api/OrganizationApi';
import { fetchDriverActivity, fetchSponsorActivity } from '../../../api/ActivityApi';

const viewTypes = {
    drivers: {
        label: "Drivers",
        columns: [
            { key: 'username', label: 'Username', sortable: true },
            { key: 'first_name', label: 'First Name', sortable: true },
            { key: 'last_name', label: 'Last Name', sortable: true },
            { key: 'last_login', label: 'Last Login', sortable: true },
            { key: 'is_active', label: 'Active', sortable: true },
            { key: 'sponsor_names', label: 'Sponsor Org(s)', sortable: true },
            { key: 'successful_logins', label: 'Successful Logins', sortable: true },
            { key: 'failed_logins', label: 'Failed Logins', sortable: true },
            { key: 'points_in_period', label: 'Points (Period)', sortable: true },
            { key: 'orders_in_period', label: 'Orders (Period)', sortable: true },
        ]
    },
    sponsors: {
        label: "Sponsors",
        columns: [
            { key: 'name', label: 'Org Name', sortable: true },
            { key: 'active_drivers', label: 'Active Drivers', sortable: true },
            { key: 'points_awarded_in_period', label: 'Points Awarded (Period)', sortable: true },
            { key: 'orders_in_period', label: 'Orders (Period)', sortable: true },
            { key: 'most_recent_sponsor_login', label: 'Most Recent Sponsor Login', sortable: true },
        ]
    }
};

const ActivityReportTab = () => {
    const [data, setData] = useState([]);
    const [viewType, setViewType] = useState('drivers');
    const [fromDate, setFromDate] = useState(null);
    const [toDate, setToDate] = useState(null);
    const [dateRange, setDateRange] = useState(false);
    const [selectedOrg, setSelectedOrg] = useState(null);
    const [organizations, setOrganizations] = useState([]);

    async function fetchData() {
        const dateRangeObj = { fromDate, toDate };
        if (viewType === 'drivers') {
            const rows = await fetchDriverActivity(selectedOrg, dateRangeObj);
            setData(rows.map(row => ({ ...row, is_active: row.is_active ? 'Yes' : 'No' })));
        } else {
            const rows = await fetchSponsorActivity(dateRangeObj);
            setData(rows);
        }
    }

    async function fetchOrgs() {
        const orgs = await fetchOrganizations();
        setOrganizations(orgs);
    }

    useEffect(() => {
        fetchOrgs();
    }, []);

    useEffect(() => {
        fetchData();
    }, [viewType, selectedOrg, fromDate, toDate]);

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
                    label="View"
                    options={Object.entries(viewTypes).map(([key, val]) => ({ value: key, label: val.label }))}
                    value={viewType}
                    onChange={setViewType}
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
                {viewType === 'drivers' &&
                    <DropdownField
                        label="Organization"
                        options={[{ label: 'All', value: null },
                            ...organizations.map(org => ({
                                label: org.name,
                                value: org.sponsor_org_id,
                            }))
                        ]}
                        value={selectedOrg}
                        onChange={setSelectedOrg}
                    />
                }
            </div>
            <h2>{viewTypes[viewType]?.label} Activity</h2>
            <SortableTable
                columns={viewTypes[viewType]?.columns || []}
                data={data}
            />
        </div>
    );
}

export default ActivityReportTab;
