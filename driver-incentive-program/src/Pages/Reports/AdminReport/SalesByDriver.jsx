import React, { useState, useEffect } from 'react';
import SortableTable from '../../../components/SortableTable';
import DatePicker from '../../../components/DatePicker';
import DropdownField from '../../../components/DropdownField';
import Field from '../../../components/Field';
import Modal from '../../../components/Modal';
import { fetchOrgDrivers, fetchOrganizations } from '../../../api/OrganizationApi';
import { fetchSalesData, fetchSalesItemData } from '../../../api/SalesApi';


const SalesByDriver = () => {
    const [fromDate, setFromDate] = useState(null);
    const [toDate, setToDate] = useState(null);
    const [isDateRange, setIsDateRange] = useState(false);
    const [selectedDriver, setSelectedDriver] = useState(null);
    const [selectedOrg, setSelectedOrg] = useState([]);
    const [dropdownDrivers, setDropdownDrivers] = useState([]);
    const [dropdownOrgs, setDropdownOrgs] = useState([]);
    const [salesData, setSalesData] = useState([]);
    const [detailedModalOpen, setDetailedModalOpen] = useState(false);
    const [detailedViewRow, setDetailedViewRow] = useState(null);
    const [detailedOrderItems, setDetailedOrderItems] = useState([]);

    async function fetchDropdownDrivers() {
        const data = await fetchOrgDrivers(selectedOrg, null, {fromDate: null, toDate: null});
        setDropdownDrivers(data);
    }

    async function fetchDropdownOrgs() {
        const data = await fetchOrganizations();
        setDropdownOrgs(data);
    }

    async function fetchSales() {
        const data = await fetchSalesData(selectedOrg, selectedDriver, {fromDate, toDate});
        setSalesData(data);
    }

    async function fetchDetailedOrderItems() {
        const data = await fetchSalesItemData(detailedViewRow.order_id);
        setDetailedOrderItems(data);
    }

    useEffect(() => {
        fetchDropdownOrgs();
    }, []);

    useEffect(() => {
        fetchDropdownDrivers();
    }, [selectedOrg])

    useEffect(() => {
        fetchSales();
    }, [selectedOrg, selectedDriver, fromDate, toDate])

    useEffect(() => {
        if (detailedViewRow != null) {
            fetchDetailedOrderItems();
        }
    }, [detailedViewRow])

    return (
        <div>
            <div 
                style={{
                    display: "grid",
                    direction: "column",
                    gap: "20px",
                    padding: "15px",
                    border: "1px solid #ddd",
                    borderRadius: "8px",
                    background: "#f9f9f9"
                }}
            >
                <div>
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
                        label="Organization"
                        options={[{label: 'All', value: null},
                            ...dropdownOrgs.map(org => ({
                                label: org.name,
                                value: org.sponsor_org_id,
                            }))
                        ]}
                        value={selectedOrg}
                        onChange={setSelectedOrg}
                    />
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
            <Field
                label="Total Sales"
                value={`$${salesData.reduce((sum, sale) => sum + parseFloat(sale.price_usd_at_purchase), 0).toFixed(2)}`}
            />
            <SortableTable
                columns={[
                    { key: 'order_id', label: 'Order ID', sortable: true },
                    { key: 'driver_user_id', label: 'Driver ID', sortable: true },
                    { key: 'sponsor_org_id', label: 'Org ID', sortable: true },
                    { key: 'price_usd_at_purchase', label: 'Price (USD)', prefix: "$", sortable: true },
                    { key: 'status', label: 'Status', sortable: true },
                    { key: 'created_at', label: 'Date', sortable: true },
                ]}
                actions={[
                    {
                        label: 'Detailed View',
                        onClick: (row) => {
                            setDetailedViewRow(row);
                            setDetailedModalOpen(true);
                        }
                    }
                ]}
                data={salesData}
            />
            <Modal
                maxWidth={"800px"}
                isOpen={detailedModalOpen}
                onClose={() => {
                    setDetailedModalOpen(false);    
                    setDetailedViewRow(null);
                    setDetailedOrderItems([]);
                }}
                title={`Detailed View for Order ID: ${detailedViewRow?.order_id}`}
                children={
                    <div>
                        <Field label="Order ID" value={detailedViewRow?.order_id} />
                        <Field label="Driver ID" value={detailedViewRow?.driver_user_id} />
                        <Field label="Org ID" value={detailedViewRow?.sponsor_org_id} />
                        <Field label="Status" value={detailedViewRow?.status} />
                        <Field label="Created At" value={detailedViewRow?.created_at} />
                        <h3>Order Items</h3>
                        <Field label="Total Order Price (USD)" value={`$${detailedViewRow?.price_usd_at_purchase}`} />
                        <SortableTable
                            columns={[
                                { key: "item_id", label: "Item ID", sortable: true },
                                { key: "quantity", label: "Quantity", sortable: true },
                                { key: "single_price", label: "Single Price (USD)", prefix: "$", sortable: true },
                                { key: "price_usd_at_purchase", label: "Total Item Price (USD)", prefix: "$", sortable: true },
                                { key: "created_at", label: "Added At", sortable: true },
                            ]}
                            data={detailedOrderItems.map(item => ({
                                ...item,
                                single_price: (item.price_usd_at_purchase / item.quantity).toFixed(2)
                            }))}
                        />
                    </div>
                }
            />
        </div>
    );
}

export default SalesByDriver;