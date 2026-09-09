// Shared confirm/detail modal primitive (originally Phase 15, scope.md §29's Database Explorer-
// only pattern; hardened here — critique 2026-09-09 P0 — into a reusable component every
// destructive admin action can use, not just table/column delete). Plain classic script (same
// "load before any type=module page script" convention as icons.js/toast.js), so window.ConfirmModal
// is guaranteed to exist by the time page-specific JS runs.
//
// Pages that want it must include the modal markup once in their .hbs (see database-explorer.hbs
// for the reference block): #modal-overlay > #modal > (.modal-header with #modal-title +
// #modal-close-btn, #modal-body, #modal-footer). Pages that don't include this markup simply never
// call ConfirmModal.open() — every function here no-ops safely if the elements aren't present.
(function () {
  const modalOverlay = document.getElementById('modal-overlay');
  const modalEl = document.getElementById('modal');
  const modalTitle = document.getElementById('modal-title');
  const modalBody = document.getElementById('modal-body');
  const modalFooter = document.getElementById('modal-footer');
  const modalCloseBtn = document.getElementById('modal-close-btn');

  function escapeHtml(value) {
    return String(value).replace(
      /[&<>"']/g,
      (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
    );
  }

  function closeModal() {
    if (!modalOverlay) return;
    modalOverlay.hidden = true;
    modalBody.innerHTML = '';
    modalFooter.innerHTML = '';
    modalEl.classList.remove('modal-wide');
  }

  function openModal(title, wide) {
    if (!modalOverlay) return;
    modalTitle.textContent = title;
    modalBody.innerHTML = '<p>Loading…</p>';
    modalFooter.innerHTML = '';
    modalEl.classList.toggle('modal-wide', Boolean(wide));
    modalOverlay.hidden = false;
  }

  function footerButton(label, className) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = className;
    btn.textContent = label;
    return btn;
  }

  function listHtml(items, formatter) {
    return `<ul>${items.map((item) => `<li>${escapeHtml(formatter(item))}</li>`).join('')}</ul>`;
  }

  // A banner (danger for a hard blocker, warning for a non-blocking heads-up) followed by a
  // bulleted list — the exact visual shape database-explorer.js already established for
  // dependent-view/referencing-FK/function-reference call-outs.
  function bannerListHtml(kind, label, items, formatter) {
    return `<p class="banner banner-${kind}">${label}</p>${listHtml(items, formatter)}`;
  }

  if (modalOverlay) {
    modalCloseBtn.addEventListener('click', closeModal);
    modalOverlay.addEventListener('click', (event) => {
      if (event.target === modalOverlay) closeModal();
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && !modalOverlay.hidden) closeModal();
    });
  }

  // High-level helper for the common "confirm a destructive action, optionally blocked, optionally
  // typed-name-gated" shape — the P0 fix: every destructive admin action gets this instead of a
  // bare window.confirm(), matching the rigor Database Explorer's table/column delete already had.
  //
  // options:
  //   bodyHtml: string — the descriptive paragraph(s) above any blocker/warning lists
  //   blockers: [{label, items, formatter}] — hard blockers (banner-danger); any non-empty list
  //     disables the confirm button entirely, same as a dependent view blocking a table delete
  //   warnings: [{label, items, formatter}] — non-blocking heads-up (banner-warning); never
  //     disables confirm, matches the "text match, not a guarantee" framing already used for
  //     table-delete's function-reference scan
  //   requireTypedName: string|null — if set, confirm stays disabled until the input matches
  //     exactly (reserved for the most destructive actions, same convention scope.md §29 set)
  //   confirmLabel / confirmClass: button copy/style (default 'Delete' / 'btn btn-danger')
  //   onConfirm: async () => ({ok: true} | {ok: false, message}) — caller performs the actual
  //     DELETE call; this only owns the modal chrome and button lifecycle
  function confirmDelete(title, options) {
    openModal(title, options.wide);
    const blockers = options.blockers || [];
    const warnings = options.warnings || [];
    const blocked = blockers.some((b) => b.items.length > 0);

    let body = options.bodyHtml || '';
    for (const b of blockers) {
      if (b.items.length > 0) body += bannerListHtml('danger', b.label, b.items, b.formatter);
    }
    if (blocked && options.blockedHint) {
      body += `<p>${escapeHtml(options.blockedHint)}</p>`;
    }
    for (const w of warnings) {
      if (w.items.length > 0) body += bannerListHtml('warning', w.label, w.items, w.formatter);
    }
    const needsTypedName = !blocked && options.requireTypedName;
    if (needsTypedName) {
      body += `
        <div class="field">
          <label for="confirm-typed-name">Type "${escapeHtml(options.requireTypedName)}" to confirm</label>
          <input type="text" id="confirm-typed-name" autocomplete="off" />
        </div>
      `;
    }
    modalBody.innerHTML = body;

    const cancelBtn = footerButton('Cancel', 'btn btn-outline');
    cancelBtn.addEventListener('click', closeModal);

    const confirmLabel = options.confirmLabel || 'Delete';
    const confirmBtn = footerButton(confirmLabel, options.confirmClass || 'btn btn-danger');
    confirmBtn.disabled = blocked || Boolean(needsTypedName);

    modalFooter.appendChild(cancelBtn);
    modalFooter.appendChild(confirmBtn);

    if (needsTypedName) {
      const input = document.getElementById('confirm-typed-name');
      input.addEventListener('input', () => {
        confirmBtn.disabled = input.value !== options.requireTypedName;
      });
      input.focus();
    }

    confirmBtn.addEventListener('click', async () => {
      if (confirmBtn.disabled) return;
      confirmBtn.disabled = true;
      confirmBtn.textContent = `${confirmLabel}…`;
      const result = await options.onConfirm();
      if (!result || !result.ok) {
        showToast((result && result.message) || `Failed to ${confirmLabel.toLowerCase()}`, 'error');
        confirmBtn.disabled = false;
        confirmBtn.textContent = confirmLabel;
        return;
      }
      closeModal();
    });
  }

  window.ConfirmModal = {
    open: openModal,
    close: closeModal,
    body: modalBody,
    footer: modalFooter,
    footerButton,
    listHtml,
    bannerListHtml,
    escapeHtml,
    confirmDelete,
  };
})();
