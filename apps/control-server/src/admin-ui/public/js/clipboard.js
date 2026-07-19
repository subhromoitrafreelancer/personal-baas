document.addEventListener('click', (event) => {
  const btn = event.target.closest('[data-copy-target], [data-copy-value]');
  if (!btn) return;

  let text;
  if (btn.dataset.copyTarget) {
    const target = document.getElementById(btn.dataset.copyTarget);
    if (!target) return;
    text = target.textContent;
  } else {
    text = btn.dataset.copyValue;
  }

  navigator.clipboard.writeText(text).then(() => {
    // Icon-only buttons (.copy-btn) swap to just a checkmark; labeled buttons ("Copy") keep a
    // visible "Copied!" label so the confirmation reads the same way the action did.
    const hadLabel = btn.textContent.trim().length > 0;
    const originalHtml = btn.innerHTML;
    const originalTitle = btn.getAttribute('title');
    const originalAriaLabel = btn.getAttribute('aria-label');

    btn.innerHTML = window.Icons.markup('check') + (hadLabel ? ' Copied!' : '');
    btn.setAttribute('title', 'Copied!');
    btn.setAttribute('aria-label', 'Copied!');

    setTimeout(() => {
      btn.innerHTML = originalHtml;
      if (originalTitle !== null) btn.setAttribute('title', originalTitle);
      if (originalAriaLabel !== null) btn.setAttribute('aria-label', originalAriaLabel);
    }, 1200);
  });
});
