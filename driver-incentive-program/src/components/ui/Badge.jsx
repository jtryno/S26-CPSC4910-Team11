import React from 'react';
import './ui.css';

const Badge = ({ tone = 'neutral', children, className = '' }) => {
  return (
    <span className={`ui-badge ui-badge--${tone} ${className}`}>
      {children}
    </span>
  );
};

export default Badge;
