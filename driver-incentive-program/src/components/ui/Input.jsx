import React from 'react';
import './ui.css';

const Input = React.forwardRef(({
  type = 'text',
  fullWidth = true,
  error = false,
  className = '',
  ...rest
}, ref) => {
  const cls = [
    'ui-input',
    fullWidth ? 'ui-input--full' : '',
    error ? 'ui-input--error' : '',
    className,
  ].filter(Boolean).join(' ');

  return <input ref={ref} type={type} className={cls} {...rest} />;
});

Input.displayName = 'Input';
export default Input;
