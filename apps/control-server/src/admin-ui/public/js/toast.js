// Shared success/error feedback for the admin console. Before this, the only feedback mechanism
// anywhere was a handful of blocking alert()s on a few failure paths — most actions (including
// saving a function, uploading a doc, or creating a user) gave no confirmation at all, making it
// hard to tell whether a button click had actually done anything. Plain classic script (like
// icons.js) so window.showToast exists before any page-specific `type="module"` script runs.
(function () {
  const DEFAULT_DURATION_MS = { success: 4000, info: 4000, error: 6000 };

  function getContainer() {
    let container = document.getElementById('toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toast-container';
      container.className = 'toast-container';
      document.body.appendChild(container);
    }
    return container;
  }

  function iconFor(type) {
    if (!window.Icons) return '';
    const name = type === 'error' ? 'warning' : type === 'success' ? 'check' : 'view';
    return window.Icons.markup(name, { size: 16 });
  }

  function showToast(message, type, durationMs) {
    type = type === 'error' || type === 'success' ? type : 'info';
    const duration = durationMs ?? DEFAULT_DURATION_MS[type];

    const container = getContainer();
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.setAttribute('role', type === 'error' ? 'alert' : 'status');
    toast.innerHTML = `
      <span class="toast-icon">${iconFor(type)}</span>
      <span class="toast-message"></span>
      <button type="button" class="toast-close" aria-label="Dismiss">${window.Icons ? window.Icons.markup('close', { size: 12 }) : '×'}</button>
    `;
    toast.querySelector('.toast-message').textContent = message;

    let dismissTimer;
    const dismiss = () => {
      clearTimeout(dismissTimer);
      toast.classList.add('toast-leaving');
      toast.addEventListener('transitionend', () => toast.remove(), { once: true });
      setTimeout(() => toast.remove(), 300);
    };
    toast.querySelector('.toast-close').addEventListener('click', dismiss);
    if (duration > 0) {
      dismissTimer = setTimeout(dismiss, duration);
    }

    container.appendChild(toast);
    return dismiss;
  }

  window.showToast = showToast;
})();
