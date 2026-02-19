import React, { useState } from 'react';

const EditableField = ({ label, value, onSave, validate  }) => {
    const [isEditing, setIsEditing] = useState(false);
    const [inputValue, setInputValue] = useState(value);
    const [error, setError] = useState('');

    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <b>{label}:</b>
                {isEditing ? (
                    <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '4px' }}>
                        <input
                            type="text"
                            defaultValue={inputValue}
                            onChange={(e) => {
                                setInputValue(e.target.value);
                                setError('');
                            }}
                            autoFocus
                        />
                        <button
                            onClick={() => {
                                if(validate) {
                                    const validationError = validate(inputValue);
                                    if(validationError) {
                                        setError(validationError);
                                        return;
                                    }
                                }
                                setError('');
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
                                setError('');
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
                        onClick={() => { setIsEditing(true); setInputValue(value); setError('');}}
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
            {error && (
                <span style={{ 
                    color: '#b81515', 
                    fontSize: '0.85em', 
                    marginTop: '2px'
                }}>
                    {error}
                </span>
            )}
    </div>
    );
}

export default EditableField;