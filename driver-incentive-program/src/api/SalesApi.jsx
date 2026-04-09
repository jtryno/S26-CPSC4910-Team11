async function fetchSalesData(orgId, driverId, dateRange) {
    try {
        const response = await fetch(`/api/sales?orgId=${orgId}&driverId=${driverId}&dateRange=${JSON.stringify(dateRange)}`, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
        });
        const data = await response.json();
        return data.sales;
    } catch (error) {
        console.error('Error fetching sales by driver:', error);
        throw error;
    }
}

async function fetchSalesItemData(orderId, orgId, dateRange) {
    try {
        const response = await fetch(`/api/sales/items?orderId=${orderId}&orgId=${orgId}&dateRange=${JSON.stringify(dateRange)}`, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
        });
        const data = await response.json();
        return data.items;
    } catch (error) {
        console.error('Error fetching sales items:', error);
        throw error;
    }
}

export { fetchSalesData, fetchSalesItemData }