// Sell form: opening-hours and mobile-money controls. The map pin picker is in map-picker.js.
(function () {
  // ----- Opening hours -----
  document.querySelectorAll('.hours-row').forEach(function (row) {
    var box = row.querySelector('input[type=checkbox]');
    var times = row.querySelectorAll('input[type=time]');
    function sync() {
      row.classList.toggle('is-closed', !box.checked);
      times.forEach(function (t) { t.disabled = !box.checked; });
    }
    box.addEventListener('change', sync);
    sync();
  });

  var copy = document.getElementById('copy-monday');
  if (copy) {
    copy.addEventListener('click', function () {
      var mon = document.querySelector('.hours-row[data-day=mon]');
      var open = mon.querySelector('input[name=mon_open]').value;
      var close = mon.querySelector('input[name=mon_close]').value;
      document.querySelectorAll('.hours-row').forEach(function (row) {
        if (!row.querySelector('input[type=checkbox]').checked) return;
        var t = row.querySelectorAll('input[type=time]');
        t[0].value = open;
        t[1].value = close;
      });
    });
  }

  // ----- Mobile money -----
  var payMethod = document.getElementById('payMethod');
  if (payMethod) {
    var numberField = document.querySelector('[data-pay=number]');
    var accountField = document.querySelector('[data-pay=account]');
    var syncPay = function () {
      var opt = payMethod.options[payMethod.selectedIndex];
      var has = Boolean(payMethod.value);
      numberField.hidden = !has;
      accountField.hidden = payMethod.value !== 'paybill';
      if (has) {
        numberField.querySelector('label').textContent = opt.getAttribute('data-number-label');
        numberField.querySelector('input').placeholder = opt.getAttribute('data-kind') === 'phone' ? '0712 345678' : 'e.g. 123456';
      }
    };
    payMethod.addEventListener('change', syncPay);
    syncPay();
  }
})();
