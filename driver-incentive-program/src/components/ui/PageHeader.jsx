import React from 'react';
import './ui.css';

const PageHeader = ({ title, subtitle, actions, className = '' }) => {
  return (
    <div className={`ui-page-header ${className}`}>
      <div className="ui-page-header__text">
        <h1 className="ui-page-header__title">{title}</h1>
        {subtitle && <p className="ui-page-header__subtitle">{subtitle}</p>}
      </div>
      {actions && <div className="ui-page-header__actions">{actions}</div>}
    </div>
  );
};

export default PageHeader;
