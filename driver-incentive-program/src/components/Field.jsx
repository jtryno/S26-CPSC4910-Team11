import React from 'react';

const Field = ({ label, value }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: 'var(--font-size-sm)' }}>
    <span style={{ fontWeight: 'var(--font-weight-semibold)', color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>
      {label}:
    </span>
    <span style={{ color: 'var(--color-text)' }}>{value}</span>
  </div>
);

export default Field;
