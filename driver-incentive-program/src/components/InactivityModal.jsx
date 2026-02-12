import React from 'react';

const InactivityModal = ({ isOpen, onStayLoggedIn, onLogoutNow }) => {
  // do not render if modal is not open
  if (!isOpen) return null;

  return (
    // overlay
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999
      }}
    >
      {/* modal content box */}
      <div
        style={{
          backgroundColor: 'white',
          borderRadius: '12px',
          padding: '40px',
          maxWidth: '500px',
          width: '90%',
          boxShadow: '0 10px 40px rgba(0, 0, 0, 0.2)',
          textAlign: 'center'
        }}
      >
        <h2 style={{
          color: '#1a1a1a',
          marginTop: '0',
          marginBottom: '20px',
          fontSize: '1.8rem'
        }}>
          Session Timeout Warning
        </h2>

        <p style={{
          color: '#666666',
          fontSize: '1.1rem',
          marginBottom: '30px',
          lineHeight: '1.6'
        }}>
          You've been inactive. You'll be automatically logged out soon unless you choose to stay logged in.
        </p>

        <div style={{
          display: 'flex',
          gap: '15px',
          justifyContent: 'center',
          flexWrap: 'wrap'
        }}>
          <button
            onClick={onStayLoggedIn}
            style={{
              padding: '14px 40px',
              fontSize: '18px',
              backgroundColor: '#0066cc',
              color: 'white',
              border: 'none',
              borderRadius: '50px',
              cursor: 'pointer',
              fontWeight: '600',
              boxShadow: '0 4px 12px rgba(0, 102, 204, 0.3)',
              transition: 'background-color 0.2s'
            }}
            onMouseOver={(e) => e.target.style.backgroundColor = '#0052a3'}
            onMouseOut={(e) => e.target.style.backgroundColor = '#0066cc'}
          >
            Stay Logged In
          </button>

          <button
            onClick={onLogoutNow}
            style={{
              padding: '14px 40px',
              fontSize: '18px',
              background: '#f0f0f0',
              color: '#333333',
              border: '1px solid #d0d0d0',
              borderRadius: '50px',
              cursor: 'pointer',
              fontWeight: '600',
              transition: 'background-color 0.2s'
            }}
            onMouseOver={(e) => e.target.style.backgroundColor = '#e0e0e0'}
            onMouseOut={(e) => e.target.style.backgroundColor = '#f0f0f0'}
          >
            Logout Now
          </button>
        </div>
      </div>
    </div>
  );
};

export default InactivityModal;
