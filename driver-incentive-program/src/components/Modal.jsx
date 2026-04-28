import React from 'react';
import UiModal from './ui/Modal';

// Thin wrapper — keeps the old prop API intact while delegating to the new ui/Modal.
const Modal = (props) => <UiModal {...props} />;

export default Modal;
