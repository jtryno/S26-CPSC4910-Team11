import React from 'react';

const InputField = ({ label, value, onChange }) => {
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <b>{label}:</b>
            <input 
                type="text" 
                value={value} 
                onChange={(e) => onChange(e.target.value)} 
                style={{ padding: '5px', borderRadius: '5px', border: '1px solid #ccc' }}
            />
        </div>
    );
}

export default InputField;