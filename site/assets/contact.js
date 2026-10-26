(function () {
  var form = document.getElementById('f');
  if (!form) return;
  var status = document.getElementById('status');
  var btn = document.getElementById('send');
  function say(msg, cls) { status.textContent = msg; status.className = 'status ' + (cls || ''); }
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (!form.checkValidity()) {
      say('Please fill in your name, a valid email and a message.', 'err');
      var bad = form.querySelector(':invalid');
      if (bad) bad.focus();
      return;
    }
    btn.disabled = true;
    say('Sending…');
    fetch(form.action, { method: 'POST', body: new FormData(form), headers: { Accept: 'application/json' } })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (res) {
        if (res.ok && res.j.ok) { form.reset(); say('Sent. I will reply by email.', 'ok'); }
        else { say(res.j.error || 'That did not send. Please try again, or email me directly.', 'err'); }
      })
      .catch(function () { say('Could not reach the server. Please try again in a minute.', 'err'); })
      .then(function () { btn.disabled = false; });
  });
})();
