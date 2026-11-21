// Search near the buyer. Buyers have no accounts, so their area comes from the browser:
// its location (when they allow it) or an area they pick. The last area is remembered
// in this browser only, so the next search starts there.
(function () {
  var KEY = 'pata-area';
  var hasGeo = 'geolocation' in navigator;

  function load() {
    try { return JSON.parse(localStorage.getItem(KEY)) || null; } catch (e) { return null; }
  }
  function save(area) {
    try { localStorage.setItem(KEY, JSON.stringify(area)); } catch (e) { /* private mode: just don't remember */ }
  }

  // ~100 m is plenty for a 5-100 km search, and keeps the exact spot out of the address.
  var round = function (n) { return Math.round(n * 1000) / 1000; };

  function locate(done, fail) {
    if (!hasGeo) return fail();
    navigator.geolocation.getCurrentPosition(
      function (p) { done(round(p.coords.latitude), round(p.coords.longitude)); },
      fail,
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 600000 }
    );
  }

  function go(params) {
    var p = new URLSearchParams();
    Object.keys(params).forEach(function (k) {
      if (params[k] !== '' && params[k] != null) p.set(k, params[k]);
    });
    location.href = '/search?' + p.toString();
  }

  // On a results page, remember the area it was for.
  var bar = document.getElementById('area-bar');
  if (bar) {
    var area = JSON.parse(bar.getAttribute('data-area') || '{}');
    if (area.lat != null || area.county) save(area);
  }

  // Search boxes outside the results page: search in the remembered area,
  // or ask for the location first. If that fails, the results page asks for an area.
  document.querySelectorAll('form[data-area-search]').forEach(function (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var q = (form.querySelector('[name=q]') || {}).value || '';
      var saved = load();
      if (saved && (saved.lat != null || saved.county)) {
        return go({ q: q, lat: saved.lat, lng: saved.lng, r: saved.r, county: saved.lat != null ? '' : saved.county,
          constituency: saved.constituency, ward: saved.ward });
      }
      form.classList.add('is-locating');
      locate(
        function (lat, lng) { go({ q: q, lat: lat, lng: lng }); },
        function () { go({ q: q, geo: hasGeo ? 'off' : '' }); }
      );
    });
  });

  // Area picker on the results page.
  var picker = document.getElementById('area-picker');
  var useLoc = document.getElementById('use-location');
  var msg = document.getElementById('geo-msg');
  var radius = document.getElementById('radius');

  if (useLoc && hasGeo) {
    useLoc.hidden = false;
    useLoc.addEventListener('click', function () {
      useLoc.disabled = true;
      useLoc.classList.add('is-locating');
      locate(
        function (lat, lng) { go({ q: useLoc.getAttribute('data-q'), lat: lat, lng: lng, r: radius ? radius.value : '' }); },
        function () {
          useLoc.disabled = false;
          useLoc.classList.remove('is-locating');
          if (msg) msg.hidden = false;
          var county = document.getElementById('county');
          if (county) county.focus();
        }
      );
    });
  }
  if (!hasGeo && msg) {
    msg.textContent = "This browser can't share your location. Pick your county instead.";
    msg.hidden = false;
  }

  if (radius) {
    radius.addEventListener('change', function () {
      go({ q: useLoc ? useLoc.getAttribute('data-q') : '', lat: radius.getAttribute('data-lat'), lng: radius.getAttribute('data-lng'), r: radius.value });
    });
  }

  // Leave blank optional fields out of the address.
  var pickerForm = document.getElementById('picker-form');
  if (pickerForm) {
    pickerForm.addEventListener('submit', function () {
      pickerForm.querySelectorAll('input').forEach(function (i) { if (!i.value) i.disabled = true; });
    });
  }

  document.querySelectorAll('[data-open-picker]').forEach(function (b) {
    b.addEventListener('click', function () {
      picker.open = true;
      picker.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  });
})();
