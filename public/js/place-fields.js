// County + constituency dropdowns: once a county is picked, list only its constituencies.
(function () {
  document.querySelectorAll('[data-place-fields]:not([data-ready])').forEach(function (box) {
    box.setAttribute('data-ready', '');
    var county = box.querySelector('select[name=county]');
    var seat = box.querySelector('select[name=constituency]');
    var groups = Array.prototype.slice.call(seat.querySelectorAll('optgroup')).map(function (g) {
      return { county: g.label, names: Array.prototype.map.call(g.querySelectorAll('option'), function (o) { return o.value; }) };
    });

    function sync() {
      var chosen = seat.value;
      var group = groups.filter(function (g) { return g.county === county.value; })[0];
      seat.innerHTML = '';
      seat.add(new Option(group ? 'Choose constituency…' : 'Choose your county first', ''));
      (group ? group.names : []).forEach(function (n) { seat.add(new Option(n, n, false, n === chosen)); });
      seat.disabled = !group;
    }
    county.addEventListener('change', sync);
    sync();
  });
})();
