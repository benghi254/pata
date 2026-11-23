// Shop page order form: +/− buttons for quantities and a running total.
(function () {
  var form = document.getElementById('order-form');
  if (!form) return;
  var totalEl = document.getElementById('order-total');
  var inputs = form.querySelectorAll('input[type=number][name^=qty_]');

  function update() {
    var total = 0; var count = 0; var unpriced = false;
    inputs.forEach(function (i) {
      var q = Math.max(0, Math.min(Number(i.max) || 99, parseInt(i.value, 10) || 0));
      if (!q) return;
      count += q;
      if (i.dataset.price === '') unpriced = true; else total += q * Number(i.dataset.price);
    });
    totalEl.textContent = count
      ? count + (count === 1 ? ' item' : ' items') + ' · KSh ' + total.toLocaleString('en-KE') + (unpriced ? ' + items priced at pickup' : '') + ', paid when you collect'
      : '';
  }

  form.addEventListener('click', function (e) {
    var b = e.target.closest('[data-step]');
    if (!b) return;
    var input = b.parentNode.querySelector('input');
    var v = (parseInt(input.value, 10) || 0) + Number(b.dataset.step);
    input.value = Math.max(0, Math.min(Number(input.max) || 99, v)) || '';
    update();
  });
  form.addEventListener('input', update);
  update();
})();
