import React from 'react';
import './ui.css';

const FormField = ({ label, htmlFor, error, hint, required, children, className = '' }) => {
  return (
    <div className={`ui-form-field ${error ? 'ui-form-field--error' : ''} ${className}`}>
      {label && (
        <label className="ui-form-field__label" htmlFor={htmlFor}>
          {label}
          {required && <span className="ui-form-field__required" aria-hidden="true"> *</span>}
        </label>
      )}
      {children}
      {hint && !error && <p className="ui-form-field__hint">{hint}</p>}
      {error && <p className="ui-form-field__error">{error}</p>}
    </div>
  );
};

export default FormField;
