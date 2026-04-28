import React from 'react';
import './ui.css';

const EmptyState = ({ icon, title, message, action, className = '' }) => {
  return (
    <div className={`ui-empty-state ${className}`}>
      {icon && <div className="ui-empty-state__icon">{icon}</div>}
      <p className="ui-empty-state__title">{title}</p>
      {message && <p className="ui-empty-state__message">{message}</p>}
      {action && <div className="ui-empty-state__action">{action}</div>}
    </div>
  );
};

export default EmptyState;
