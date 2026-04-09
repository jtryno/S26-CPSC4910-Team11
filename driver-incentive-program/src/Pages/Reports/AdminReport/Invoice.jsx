import React, { useState, useEffect, use } from 'react';
import SortableTable from '../../../components/SortableTable';
import DatePicker from '../../../components/DatePicker';
import DropdownField from '../../../components/DropdownField';
import Field from '../../../components/Field';
import { fetchOrganizations } from '../../../api/OrganizationApi';
import { fetchSalesData, fetchSalesItemData } from '../../../api/SalesApi';

const Invoice = () => {
    const [fromDate, setFromDate] = useState(null);
    const [toDate, setToDate] = useState(null);
    const [selectedOrg, setSelectedOrg] = useState(null);
    const [dropdownOrgs, setDropdownOrgs] = useState([]);
    const [itemSales, setItemSales] = useState([]);
    const [driverSales, setDriverSales] = useState([]);

    async function fetchDropdownOrgs() {
        const data = await fetchOrganizations();
        setDropdownOrgs(data);
    }

    async function fetchOrders() {
        const salesData = await fetchSalesData(selectedOrg, null, {fromDate, toDate});
        
        const driverSalesMap = {};

        salesData.forEach(order => {
            if (!driverSalesMap[order.driver_user_id]) {
                driverSalesMap[order.driver_user_id] = { driver_user_id: order.driver_user_id, amount_orders: 0, total_spent: 0 };
            }
            driverSalesMap[order.driver_user_id].amount_orders += 1;
            driverSalesMap[order.driver_user_id].total_spent += Number(order.price_usd_at_purchase);
        });

        const formattedDriverSales = Object.values(driverSalesMap).map(driver => ({
            driver_user_id: driver.driver_user_id,
            amount_orders: driver.amount_orders,
            total_spent: driver.total_spent.toFixed(2)
        }));
        setDriverSales(formattedDriverSales);

        const itemSalesData = await fetchSalesItemData(null, selectedOrg, {fromDate, toDate});

        const itemSalesMap = {};

        itemSalesData.forEach(item => {
            if (!itemSalesMap[item.item_id]) {
                itemSalesMap[item.item_id] = { item_id: item.item_id, quantity: 0, unit_price: (item.price_usd_at_purchase / item.quantity).toFixed(2) || 0, price_usd_at_purchase: 0 };
            }
            itemSalesMap[item.item_id].quantity += Number(item.quantity);
            itemSalesMap[item.item_id].price_usd_at_purchase += Number(item.price_usd_at_purchase);
        });

        const formattedItemSales = Object.values(itemSalesMap).map(item => ({
            item_id: item.item_id,
            quantity: item.quantity,
            unit_price: item.unit_price,
            price_usd_at_purchase: item.price_usd_at_purchase.toFixed(2)
        }));

        setItemSales(formattedItemSales);

    }


    useEffect(() => {
        fetchDropdownOrgs();
    }, []);

    useEffect(() => {
        fetchOrders();
    }, [selectedOrg, fromDate, toDate])


    return (
        <div>
            <h3>Filters</h3>
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
                <div>
                    <DatePicker
                        label="From"
                        value={fromDate}
                        onChange={setFromDate}
                    />
                    <DatePicker
                        label="To"
                        value={toDate}
                        onChange={setToDate}
                    />
                </div>
            </div>
            <h2>{dropdownOrgs.find(org => org.sponsor_org_id === Number(selectedOrg))?.name || "All Orgs"} Invoice</h2>
            <div style={{ display: "grid", gap: "20px", direction: "column"}}>
                <div>
                    <h3>Fee by Driver</h3>
                    <SortableTable
                        columns={[
                            { key: 'driver_user_id', label: 'Driver ID', sortable: true },
                            { key: 'amount_orders', label: 'Amount of Orders', sortable: true },
                            { key: 'total_spent', label: 'Total', prefix: '$', sortable: true },
                        ]}
                        data={driverSales}
                    />
                    <div style={{ display: "flex", justifyContent: "flex-end" }}>
                        <Field
                            label="Total Fee"
                            value={`$${driverSales
                                .reduce((sum, driver) => sum + parseFloat(driver.total_spent), 0)
                                .toFixed(2)}`}
                        />
                    </div>
                </div>
                <div>
                    <h3>Fee by Item</h3>
                    <SortableTable
                        columns={[
                            { key: 'item_id', label: 'Item ID', sortable: true },
                            { key: 'quantity', label: 'Quantity Sold', sortable: true },
                            { key: 'unit_price', label: 'Unit Price', prefix: '$', sortable: true },
                            { key: 'price_usd_at_purchase', label: 'Total', prefix: '$', sortable: true },
                        ]}
                        data={itemSales}
                    />
                    <div style={{ display: "flex", justifyContent: "flex-end" }}>
                        <Field
                            label="Total Fee"
                            value={`$${itemSales
                                .reduce((sum, item) => sum + parseFloat(item.price_usd_at_purchase), 0)
                                .toFixed(2)}`}
                        />
                    </div>
                </div>
            </div>
        </div>
    );
}

export default Invoice;