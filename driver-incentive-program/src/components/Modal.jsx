import React from 'react';

const Modal = ({ isOpen, onClose, onSave, title, children }) => {
    if (!isOpen) return null;

    return (
        <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000
        }}>
            <div style={{
                background: '#ffffff',
                borderRadius: '10px',
                minWidth: '340px',
                maxWidth: '500px',
                width: '100%',
                boxShadow: '0 10px 30px rgba(0,0,0,0.2)',
                animation: 'modalFadeIn 0.2s ease-out'
            }}>
                <div style={{display: 'flex', justifyContent: 'space-between', padding: '5px 10px', alignItems: 'center', borderBottom: '1px solid #e5e5e5'}}>
                    <h2 style={{margin: '0px'}}>{title}</h2>
                    <button onClick={onClose} 
                        style={{
                            width: "30px",
                            height: "30px",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            padding: 0,
                            lineHeight: 1,
                            fontSize: "20px",
                            cursor: "pointer",
                            backgroundColor: "#e74c3c"
                        }}
                    >
                        ×
                    </button>
                </div>
                <div style={{padding: "20px", borderBottom: '1px solid #e5e5e5'}}>
                    {children}
                </div>
                <div style={{display: 'flex', gap: '10px', justifyContent: 'flex-end', padding: '5px 10px'}}>
                    <button 
                        onClick={onClose}
                        style={{
                            backgroundColor: '#e0e0e0',
                            color: 'black',
                        }}
                    >
                        Close
                    </button>
                    <button 
                        onClick={onSave}
                        style={{
                            
                        }}
                    >
                        Save
                    </button>
                </div>
            </div>
        </div>
    );
}

export default Modal;