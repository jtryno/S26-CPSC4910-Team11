import React from 'react';
import './ui.css';

const Toolbar = ({ children, className = '' }) => {
  return (
    <div className={`ui-toolbar ${className}`}>
      {children}
    </div>
  );
};

export default Toolbar;
