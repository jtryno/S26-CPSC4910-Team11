import React from 'react';
import './ui.css';

const IconButton = ({
  variant = 'ghost',
  size = 'md',
  label,
  disabled = false,
  onClick,
  children,
  className = '',
  ...rest
}) => {
  const cls = [
    'ui-icon-btn',
    `ui-icon-btn--${variant}`,
    `ui-icon-btn--${size}`,
    className,
  ].filter(Boolean).join(' ');

  return (
    <button
      type="button"
      className={cls}
      disabled={disabled}
      onClick={onClick}
      aria-label={label}
      title={label}
      {...rest}
    >
      {children}
    </button>
  );
};

export default IconButton;
