let _toastAdd = null;

export function registerToastAdder(fn) {
  _toastAdd = fn;
  return () => { _toastAdd = null; };
}

export function useToast() {
  const show = (message, tone = 'info', duration = 4000) => {
    _toastAdd?.({ id: Date.now(), message, tone, duration });
  };
  return {
    success: (msg) => show(msg, 'success'),
    danger:  (msg) => show(msg, 'danger'),
    warning: (msg) => show(msg, 'warning'),
    info:    (msg) => show(msg, 'info'),
  };
}
