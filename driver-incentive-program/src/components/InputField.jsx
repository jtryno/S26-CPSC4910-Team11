import React from 'react';
import FormField from './ui/FormField';
import Input from './ui/Input';

const InputField = ({ label, value, type, onChange, validate, variant, required }) => {
  const [error, setError] = React.useState('');
  const [used, setUsed] = React.useState(false);

  React.useEffect(() => {
    if (validate) setError(validate(value) || '');
  }, [value, validate]);

  const isAuth = variant === 'auth';

  const field = (
    <Input
      type={type || 'text'}
      placeholder={isAuth ? label : undefined}
      value={value}
      fullWidth={isAuth}
      error={!!(error && used)}
      onChange={(e) => {
        onChange(e.target.value);
        if (validate) { setError(validate(e.target.value) || ''); setUsed(true); }
      }}
      onBlur={() => setUsed(true)}
      required={required || false}
    />
  );

  if (isAuth) {
    return (
      <FormField error={used ? error : undefined}>
        {field}
      </FormField>
    );
  }

  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
      <label style={{ whiteSpace: 'nowrap', fontSize: 'var(--font-size-sm)', fontWeight: 'var(--font-weight-medium)', paddingTop: '6px' }}>
        {label}
      </label>
      <FormField error={used ? error : undefined}>
        {field}
      </FormField>
    </div>
  );
};

export default InputField;
