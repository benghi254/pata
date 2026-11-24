// Home page: filter categories as you type. Enter searches listings in the buyer's constituency.
(function () {
  var input = document.getElementById('find');
  if (!input) return;
  var items = Array.prototype.slice.call(document.querySelectorAll('.findable'));
  var sections = Array.prototype.slice.call(document.querySelectorAll('.findable-section'));
  var none = document.getElementById('no-match');
  var status = document.getElementById('find-status');
  var defaultStatus = status.innerHTML;

  function apply() {
    var words = input.value.toLowerCase().trim().split(/\s+/).filter(Boolean);
    var shown = 0;
    items.forEach(function (el) {
      var text = el.getAttribute('data-search');
      var match = words.every(function (w) { return text.indexOf(w) !== -1; });
      el.hidden = !match;
      if (match) shown++;
    });
    sections.forEach(function (s) {
      s.hidden = !s.querySelector('.findable:not([hidden])');
    });
    none.hidden = shown > 0;
    if (!words.length) {
      status.innerHTML = defaultStatus;
      bindPills();
    } else {
      status.textContent = shown === 1 ? '1 category matches.' : shown + ' categories match.';
    }
  }

  function bindPills() {
    status.querySelectorAll('.pill').forEach(function (b) {
      b.addEventListener('click', function () {
        input.value = b.getAttribute('data-q');
        apply();
        var first = document.querySelector('.findable:not([hidden])');
        if (first) first.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
    });
  }

  input.addEventListener('input', apply);
  document.getElementById('clear-find').addEventListener('click', function () {
    input.value = '';
    apply();
    input.focus();
  });
  bindPills();
})();
