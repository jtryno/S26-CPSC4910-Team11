import React, { useEffect, useRef } from 'react';
import './ui.css';

const Modal = ({
  isOpen,
  onClose,
  onSave,
  title,
  description,
  children,
  saveLabel = 'Save',
  saveDisabled = false,
  maxWidth = '520px',
  size,
  tone,
  footer,
}) => {
  const dialogRef = useRef(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; });

  useEffect(() => {
    if (!isOpen) return;
    const prev = document.activeElement;
    dialogRef.current?.focus();
    const handleKey = (e) => { if (e.key === 'Escape') onCloseRef.current(); };
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('keydown', handleKey);
      prev?.focus();
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const widthMap = { sm: '400px', md: '520px', lg: '700px', xl: '900px' };
  const resolvedWidth = size ? widthMap[size] : maxWidth;

  return (
    <div
      className="ui-modal-overlay"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        ref={dialogRef}
        className={`ui-modal ${tone ? `ui-modal--${tone}` : ''}`}
        style={{ maxWidth: resolvedWidth }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="ui-modal-title"
        tabIndex={-1}
      >
        <div className="ui-modal__header">
          <div>
            <h2 id="ui-modal-title" className="ui-modal__title">{title}</h2>
            {description && <p className="ui-modal__description">{description}</p>}
          </div>
          <button
            type="button"
            className="ui-modal__close"
            onClick={onClose}
          >
            ×
          </button>
        </div>

        <div className="ui-modal__body">{children}</div>

        {footer !== null && (
          <div className="ui-modal__footer">
            {footer || (
              <>
                <button type="button" className="ui-btn ui-btn--secondary ui-btn--md" onClick={onClose}>
                  Cancel
                </button>
                {onSave && (
                  <button
                    type="button"
                    className="ui-btn ui-btn--primary ui-btn--md"
                    onClick={onSave}
                    disabled={saveDisabled}
                  >
                    {saveLabel}
                  </button>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default Modal;
