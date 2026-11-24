// County -> Constituency -> Ward pickers (views/partials/place-fields.ejs).
// Choosing a county fills the constituency list; choosing a constituency fills the ward list.
// Changing a choice clears the ones after it. The lists come from /places.json, loaded once.
(function () {
  document.querySelectorAll('[data-places]').forEach(function (box) {
    var county = box.querySelector('[data-level=county]');
    var con = box.querySelector('[data-level=constituency]');
    var ward = box.querySelector('[data-level=ward]');
    var tree = null;
    var loading = null;

    function load() {
      if (!loading) {
        loading = fetch(box.getAttribute('data-places'))
          .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
          .then(function (data) { tree = data; return data; })
          .catch(function (err) { loading = null; throw err; });
      }
      return loading;
    }

    function fill(select, names, prompt, emptyPrompt) {
      select.innerHTML = '';
      var first = document.createElement('option');
      first.value = '';
      first.textContent = names.length ? prompt : emptyPrompt;
      select.appendChild(first);
      names.forEach(function (n) {
        var o = document.createElement('option');
        o.textContent = n;
        select.appendChild(o);
      });
      select.disabled = !names.length;
    }

    function failed() {
      fill(con, [], '', 'Could not load the list. Check your connection.');
      if (ward) fill(ward, [], '', 'Choose a constituency first');
    }

    county.addEventListener('change', function () {
      if (ward) fill(ward, [], '', 'Choose a constituency first');
      if (!county.value) return fill(con, [], '', 'Choose a county first');
      con.disabled = true;
      con.options[0].textContent = 'Loading…';
      load().then(function () {
        fill(con, Object.keys(tree[county.value] || {}), 'Choose constituency…', 'Choose a county first');
      }, failed);
    });

    // Without a ward list (the buyer's constituency picker) there is nothing more to fill.
    if (ward) con.addEventListener('change', function () {
      if (!con.value) return fill(ward, [], '', 'Choose a constituency first');
      load().then(function () {
        var wards = (tree[county.value] || {})[con.value] || [];
        fill(ward, wards, 'Choose ward…', 'No wards listed');
      }, failed);
    });

    // Start loading early so the first choice feels instant.
    county.addEventListener('focus', function () { load().catch(function () {}); }, { once: true });
  });
})();
