import React from 'react';
import './ui.css';

const Select = React.forwardRef(({
  fullWidth = true,
  error = false,
  className = '',
  children,
  ...rest
}, ref) => {
  const cls = [
    'ui-select',
    fullWidth ? 'ui-select--full' : '',
    error ? 'ui-select--error' : '',
    className,
  ].filter(Boolean).join(' ');

  return (
    <select ref={ref} className={cls} {...rest}>
      {children}
    </select>
  );
});

Select.displayName = 'Select';
export default Select;
