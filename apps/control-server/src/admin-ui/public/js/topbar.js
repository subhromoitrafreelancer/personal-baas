document.querySelectorAll('.topnav a[href]').forEach((link) => {
  if (link.getAttribute('href') === location.pathname) {
    link.classList.add('active');
  }
});
