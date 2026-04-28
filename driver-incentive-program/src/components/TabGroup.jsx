import React from 'react';
import Tabs from './ui/Tabs';

// Thin wrapper — keeps the old { tabs } prop shape while delegating to ui/Tabs.
const TabGroup = ({ tabs, defaultIndex, activeIndex, onChange }) => (
  <Tabs
    tabs={tabs}
    defaultIndex={defaultIndex}
    activeIndex={activeIndex}
    onChange={onChange}
  />
);

export default TabGroup;
