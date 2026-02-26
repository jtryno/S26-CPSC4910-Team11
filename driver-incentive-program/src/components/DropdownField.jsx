import React, { useState, useEffect } from 'react';

const DropdownField = ({ label, options, onChange }) => {
    const [selectedValue, setSelectedValue] = useState(options[0]?.value || null);

    useEffect(() => {
        onChange(selectedValue);
    }, [options]);

    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <label>{label}:</label>
            <select 
                style={{ padding: '5px', borderRadius: '5px', border: '1px solid #ccc' }}
                value={selectedValue} 
                onChange={(e) => {
                    setSelectedValue(e.target.value);
                    onChange(e.target.value);
                }}>
                {options.map((option) => (
                    <option key={option.value} value={option.value}>
                        {option.label}
                    </option>
                ))}
            </select>
        </div>
    );
}

export default DropdownField;