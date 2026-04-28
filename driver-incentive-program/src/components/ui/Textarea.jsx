import React from 'react';
import './ui.css';

const Textarea = React.forwardRef(({
  fullWidth = true,
  error = false,
  rows = 4,
  className = '',
  ...rest
}, ref) => {
  const cls = [
    'ui-textarea',
    fullWidth ? 'ui-textarea--full' : '',
    error ? 'ui-textarea--error' : '',
    className,
  ].filter(Boolean).join(' ');

  return <textarea ref={ref} className={cls} rows={rows} {...rest} />;
});

Textarea.displayName = 'Textarea';
export default Textarea;
