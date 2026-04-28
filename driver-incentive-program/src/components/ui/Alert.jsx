import React from 'react';
import './ui.css';

const Alert = ({ tone = 'info', title, children, onClose, className = '' }) => {
  return (
    <div className={`ui-alert ui-alert--${tone} ${className}`} role="alert">
      <div className="ui-alert__body">
        {title && <p className="ui-alert__title">{title}</p>}
        <p className="ui-alert__message">{children}</p>
      </div>
      {onClose && (
        <button
          type="button"
          className="ui-alert__close"
          onClick={onClose}
          aria-label="Dismiss"
        >
          ×
        </button>
      )}
    </div>
  );
};

export default Alert;
