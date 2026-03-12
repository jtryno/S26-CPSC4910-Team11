import React, { useState, useEffect } from 'react';

const DatePicker = ({ label, value, onChange }) => {

    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <label>{label}:</label>
            <input
                type="date"
                value={value}
                onChange={(e) => {
                    onChange(e.target.value);
                }}
            />
        </div>
    );
}

export default DatePicker;