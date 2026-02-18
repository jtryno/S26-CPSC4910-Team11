import React, { useState } from 'react';

const Field = ({ label, value }) => {

    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <b>{label}:</b>
            <span>{value}</span>
        </div>
    );
}

export default Field;