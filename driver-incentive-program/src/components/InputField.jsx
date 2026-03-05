import React, { useEffect } from 'react';
import Field from './Field';

const InputField = ({ label, value, type, onChange, validate, variant, required}) => {
    const [error, setError] = React.useState('');
    const [used, setUsed] = React.useState(false);

    React.useEffect(() => {
        if (validate) {
            const error = validate(value);
            setError(error || '');
        }
    }, [value, validate]);

    const variants = {
        default: {
            fieldStyle: { display: 'flex', alignItems: 'center', gap: '10px' },
            inputStyle: { padding: '5px', borderRadius: '5px', border: '1px solid #ccc' },
            labelStyle: { whiteSpace: 'nowrap',}
        },
        auth: {
            fieldStyle: {},
            inputStyle: { width: '100%', padding: '12px', fontSize: '1em', border: '1px solid #d0d0d0', borderRadius: '6px', boxSizing: 'border-box', fontFamily: 'inherit'},
        }
    }
    
    return (
        <div style={variants[variant || 'default'].fieldStyle}>
            {variants[variant || 'default'].labelStyle && <label style={variants[variant || 'default'].labelStyle}>{label}</label>}
            <div style={{ display: 'flex', flexDirection: 'column' }}>
                <input 
                    type={type || 'text'}
                    placeholder={variants[variant || 'default'].labelStyle ? '' : label}
                    value={value} 
                    onChange={(e) => {
                        onChange(e.target.value)
                        if (validate) {
                            const error = validate(e.target.value);
                            setError(error || '');
                            setUsed(true);
                        }
                    }}
                    onBlur={() => setUsed(true)}
                    style={variants[variant || 'default'].inputStyle}
                    required={required || false}
                />
                {error && used && (
                    <span style={{ 
                        color: '#b81515', 
                        fontSize: '0.85em', 
                        marginTop: '2px',
                    }}>
                        {error}
                    </span>
                )}
            </div>
        </div>
    );
}

export default InputField;