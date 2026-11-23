// "Copy" buttons for payment numbers. They stay hidden where the clipboard isn't available.
(function () {
  if (!navigator.clipboard || !window.isSecureContext) return;
  document.querySelectorAll('.copy-btn[data-copy]').forEach(function (btn) {
    btn.hidden = false;
    btn.addEventListener('click', function () {
      navigator.clipboard.writeText(btn.getAttribute('data-copy')).then(function () {
        btn.textContent = 'Copied';
        setTimeout(function () { btn.textContent = 'Copy'; }, 2000);
      }, function () {
        btn.textContent = "Couldn't copy";
      });
    });
  });
})();
