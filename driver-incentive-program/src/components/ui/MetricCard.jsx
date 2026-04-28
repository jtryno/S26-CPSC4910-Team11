import React from 'react';
import './ui.css';

const MetricCard = ({ label, value, sub, tone = 'neutral', icon, className = '' }) => {
  return (
    <div className={`ui-metric-card ui-metric-card--${tone} ${className}`}>
      {icon && <div className="ui-metric-card__icon">{icon}</div>}
      <div className="ui-metric-card__body">
        <p className="ui-metric-card__label">{label}</p>
        <p className="ui-metric-card__value">{value}</p>
        {sub && <p className="ui-metric-card__sub">{sub}</p>}
      </div>
    </div>
  );
};

export default MetricCard;
