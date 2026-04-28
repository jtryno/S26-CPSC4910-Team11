import React, { useState, useEffect } from 'react';
import Select from './ui/Select';

const DropdownField = ({ label, options, onChange }) => {
  const [selectedValue, setSelectedValue] = useState(null);

  useEffect(() => {
    if (options.length > 0 && selectedValue == null) {
      setSelectedValue(options[0].value);
      onChange(options[0].value);
    }
  }, [options]);

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
      <label style={{ fontSize: 'var(--font-size-sm)', fontWeight: 'var(--font-weight-medium)', whiteSpace: 'nowrap' }}>
        {label}:
      </label>
      <Select
        fullWidth={false}
        value={selectedValue ?? ''}
        onChange={(e) => { setSelectedValue(e.target.value); onChange(e.target.value); }}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </Select>
    </div>
  );
};

export default DropdownField;
