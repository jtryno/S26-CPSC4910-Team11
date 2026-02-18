import React, { useState } from 'react';

const EditableField = ({ label, value, onSave }) => {
    const [isEditing, setIsEditing] = useState(false);
    const [inputValue, setInputValue] = useState(value);

    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <b>{label}:</b>
            {isEditing ? (
                <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '4px' }}>
                    <input
                        type="text"
                        defaultValue={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        autoFocus
                    />
                    <button
                        onClick={() => {
                            value = inputValue;
                            onSave(inputValue);
                            setIsEditing(false);
                        }}
                        style={{
                            padding: '2px 6px',
                            fontSize: '0.8em',
                            borderRadius: '4px',
                        }}
                    >
                        Save
                    </button>
                    <button
                        onClick={() => {
                            setIsEditing(false);
                            setInputValue(value);
                        }}
                        style={{
                            padding: '2px 6px',
                            fontSize: '0.8em',
                            borderRadius: '4px',
                            backgroundColor: '#e0e0e0',
                            color: "black"
                        }}
                    >
                        Cancel
                    </button>
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '4px' }}>
                    <span>{value}</span>
                    <button 
                    onClick={() => { setIsEditing(true); setInputValue(value); }}
                    style={{
                        padding: '2px 6px',
                        fontSize: '0.8em',
                        borderRadius: '4px',
                    }}
                    >
                        Edit
                    </button>
                </div>
            )}
        </div>
    );
}

export default EditableField;