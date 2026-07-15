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
    const original = btn.textContent;
    btn.textContent = 'Copied!';
    setTimeout(() => {
      btn.textContent = original;
    }, 1200);
  });
});
