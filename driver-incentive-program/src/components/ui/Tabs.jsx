import React, { useState } from 'react';
import './ui.css';

const Tabs = ({
  tabs,
  defaultIndex = 0,
  activeIndex,
  onChange,
  className = '',
}) => {
  const [internalIndex, setInternalIndex] = useState(defaultIndex);
  const controlled = activeIndex !== undefined;
  const current = controlled ? activeIndex : internalIndex;

  const handleSelect = (i) => {
    if (!controlled) setInternalIndex(i);
    onChange?.(i);
  };

  return (
    <div className={`ui-tabs ${className}`}>
      <div className="ui-tabs__bar">
        {tabs.map((tab, i) => (
          <button
            key={i}
            className={`ui-tabs__tab ${current === i ? 'ui-tabs__tab--active' : ''}`}
            onClick={() => handleSelect(i)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {tabs[current]?.content != null && (
        <div className="ui-tabs__panel" role="tabpanel">
          {tabs[current].content}
        </div>
      )}
    </div>
  );
};

export default Tabs;
