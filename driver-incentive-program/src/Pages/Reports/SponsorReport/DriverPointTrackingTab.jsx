import React, {useState, useEffect} from 'react';
import Modal from '../../../components/Modal';
import SortableTable from '../../../components/SortableTable';
import DropdownField from '../../../components/DropdownField';
import DatePicker from '../../../components/DatePicker';
import { fetchOrgDrivers } from '../../../api/OrganizationApi';
import { fetchOrgPointChanges } from '../../../api/OrganizationApi';


const DriverPointTrackingTab = ({ orgId }) => {
    const [fromDate, setFromDate] = useState(null);
    const [toDate, setToDate] = useState(null);
    const [isDateRange, setIsDateRange] = useState(false);
    const [selectedDriver, setSelectedDriver] = useState(null);
    const [dropdownDrivers, setDropdownDrivers] = useState([]);
    const [orgDrivers, setOrgDrivers] = useState([]);
    const [pointChangeModalOpen, setPointChangeModalOpen] = useState(false);
    const [selectedPointChangeDriver, setSelectedPointChangeDriver] = useState(null);
    const [pointChanges, setPointChanges] = useState([]);

    async function fetchDrivers() {
        const data = await fetchOrgDrivers(orgId, selectedDriver, {fromDate, toDate});
        setOrgDrivers(data);
    }

    async function fetchDropdownDrivers() {
        const data = await fetchOrgDrivers(orgId, null, {fromDate: null, toDate: null});
        setDropdownDrivers(data);
    }

    async function fetchPointChanges(driverId) {
        const data = await fetchOrgPointChanges(orgId, {fromDate: null, toData: null});
        setPointChanges(data);
    }

    useEffect(() => {
        if (!orgId) return;
        fetchDrivers();
    }, [orgId, selectedDriver, fromDate, toDate])

    useEffect(() => {
        if (!orgId) return;
        fetchDropdownDrivers();
    }, [orgId])

    useEffect(() => {
        fetchPointChanges();
    }, [selectedPointChangeDriver])

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
                <div style={{ gridColumn: "1 / span 2" }}>
                    <button
                        style={{ width: '75px', height: '20px', marginRight: '10px', justifyContent: 'center', alignItems: 'center', display: 'flex', fontSize: '12px' }}
                        onClick={() => {
                            setIsDateRange(!isDateRange);
                            setToDate("");
                        }}
                    >
                        {!isDateRange ? "Single" : "Range"}
                    </button>
                    <DatePicker
                        label={isDateRange ? "From" : "Date"}
                        value={fromDate}
                        onChange={setFromDate}
                    />
                    {isDateRange &&
                        <DatePicker
                            label="To"
                            value={toDate}
                            onChange={setToDate}
                        />
                    }
                </div>
                <DropdownField
                    label="Driver User"
                    options={[{label: 'All', value: null},
                        ...dropdownDrivers.map(driver => ({
                            label: driver.username,
                            value: driver.user_id,
                        }))
                    ]}
                    value={selectedDriver}
                    onChange={setSelectedDriver}
                />
            </div>
            <h2>Driver Point Tracking</h2>
            <SortableTable
                columns={[
                    { key: 'user_id', label: "User ID", sortable: true },
                    { key: 'username', label: "Username", sortable: true },
                    { key: 'current_points_balance', label: "Total Points", sortable: true },
                    { key: 'created_at', label: "Date", sortable: true }
                ]}
                actions={[
                    { 
                        label: 'View Point Changes',
                        onClick: (row) => {
                            setSelectedPointChangeDriver(row);
                            setPointChangeModalOpen(true);
                        }
                    }
                ]}
                data={orgDrivers}
            />
            <Modal
                maxWidth={"800px"}
                isOpen={pointChangeModalOpen}
                onClose={() => {
                    setPointChangeModalOpen(false);
                    setSelectedPointChangeDriver(null);
                }}
                children={
                    <div style={{ display: "grid", direction: "row", gap: "10px" }}>
                        <SortableTable
                            columns={[
                                { key: "transaction_id", label: "Transaction ID", sortable: true },
                                { key: "point_amount", label: "Point Amount", sortable: true },
                                { key: "reason", label: "Reason", sortable: false },
                                { key: "source", label: "Source", sortable: true },
                                { key: "created_by_user_id", label: "Created By", sortable: true }
                            ]}
                            data={pointChanges}
                            rowsPerPage={8}
                        />
                        <button
                            onClick={() => {

                            }}
                            style={{
                                width: "200px"
                            }}
                        >
                            Generate CSV
                        </button>
                    </div>
                }
                title={`${selectedPointChangeDriver?.username} Point Changes`}
            />
        </div>
    );
}

export default DriverPointTrackingTab;