import React from 'react';
import './ui.css';

const Card = ({ children, className = '', padding = true, ...rest }) => {
  return (
    <div className={`ui-card ${padding ? 'ui-card--padded' : ''} ${className}`} {...rest}>
      {children}
    </div>
  );
};

export default Card;
