import React, { useEffect, useState } from 'react';
import './ui.css';
import { registerToastAdder } from './useToast';

export const ToastItem = ({ id, tone = 'info', message, duration = 4000, onDismiss }) => {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => {
      setVisible(false);
      setTimeout(() => onDismiss(id), 300);
    }, duration);
    return () => clearTimeout(t);
  }, [id, duration, onDismiss]);

  return (
    <div className={`ui-toast ui-toast--${tone} ${visible ? 'ui-toast--in' : 'ui-toast--out'}`}>
      <span className="ui-toast__message">{message}</span>
      <button
        type="button"
        className="ui-toast__close"
        onClick={() => { setVisible(false); setTimeout(() => onDismiss(id), 300); }}
        aria-label="Dismiss"
      >
        ×
      </button>
    </div>
  );
};

const ToastProvider = ({ children }) => {
  const [toasts, setToasts] = useState([]);

  useEffect(() => registerToastAdder((t) => setToasts(prev => [...prev, t])), []);

  const dismiss = (id) => setToasts(prev => prev.filter(t => t.id !== id));

  return (
    <>
      {children}
      <div className="ui-toast-region" aria-live="polite" aria-atomic="false">
        {toasts.map(t => (
          <ToastItem key={t.id} {...t} onDismiss={dismiss} />
        ))}
      </div>
    </>
  );
};

export default ToastProvider;
