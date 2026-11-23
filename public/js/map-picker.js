// Sell form: where is the shop? Three ways to place the pin, then drag it onto the exact spot:
//   1. "Use my current location" (best when standing at the shop),
//   2. search for a place, road or landmark,
//   3. tap the map. The map also follows the county / constituency / ward chosen above.
// Place search uses OpenStreetMap's Nominatim service, only when the seller asks (button,
// Enter, or choosing a constituency / ward), never while typing, as its usage policy asks.
(function () {
  var el = document.getElementById('picker');
  if (!el) return;
  var status = document.getElementById('coords');
  if (!window.L || !window.PataMap) {
    el.innerHTML = '<p class="hint" style="padding:20px">The map could not load. Check your internet connection; you can still save without a pin.</p>';
    return;
  }
  var P = window.PataMap;
  var latInput = document.getElementById('latitude');
  var lngInput = document.getElementById('longitude');
  var clearBtn = document.getElementById('clear-pin');
  var locateBtn = document.getElementById('locate');
  var searchInput = document.getElementById('map-q');
  var searchBtn = document.getElementById('map-go');
  var results = document.getElementById('map-results');
  var centres = JSON.parse(el.getAttribute('data-counties') || '[]'); // [[name, lat, lng], ...]

  function say(text, tone) {
    status.textContent = text;
    status.className = 'pin-status' + (tone ? ' ' + tone : '');
  }

  var start = latInput.value && lngInput.value ? [Number(latInput.value), Number(lngInput.value)] : null;
  var map = L.map(el, { zoomControl: true }).setView(start || [0.2, 37.9], start ? 17 : 6); // all of Kenya
  P.tiles(map);
  P.wheelOnFocus(map);
  P.fullscreen(document.getElementById('picker-wrap'), map, document.getElementById('map-full'));

  var marker = null;
  var accuracy = null;
  function setPin(latlng, opts) {
    opts = opts || {};
    var lat = Math.round(latlng.lat * 1e6) / 1e6;
    var lng = Math.round(latlng.lng * 1e6) / 1e6;
    if (!marker) {
      marker = L.marker([lat, lng], { draggable: true, autoPan: true, icon: P.pinIcon(), keyboard: true, title: 'Your shop. Drag to move.' }).addTo(map);
      marker.on('dragend', function () { setPin(marker.getLatLng(), { dragged: true }); });
    } else {
      marker.setLatLng([lat, lng]);
    }
    if (accuracy && !opts.keepAccuracy) { map.removeLayer(accuracy); accuracy = null; }
    latInput.value = lat;
    lngInput.value = lng;
    clearBtn.hidden = false;
    if (opts.zoom) map.setView([lat, lng], opts.zoom);
    if (!P.inKenya(lat, lng)) return say('This pin is outside Kenya. Check it is on your shop.', 'warn');
    say(opts.message || (opts.dragged ? '✓ Pin moved. Your shop is saved here when you submit.' : '✓ Pin placed. Drag it if it isn’t exactly on your shop.'), 'ok');
  }

  if (start) setPin({ lat: start[0], lng: start[1] }, { message: '✓ Your shop’s pin. Drag it to change.' });
  else say('No pin yet. Use one of the options above, or tap the map at your shop.');

  // Taps from far away are imprecise, so place the pin and zoom in for a closer look.
  map.on('click', function (e) {
    var far = map.getZoom() < 16;
    setPin(e.latlng, far ? { zoom: 17, message: 'Zoomed in for you. Drag the pin onto your exact shop, or tap again.' } : {});
  });

  clearBtn.addEventListener('click', function () {
    if (marker) { map.removeLayer(marker); marker = null; }
    if (accuracy) { map.removeLayer(accuracy); accuracy = null; }
    latInput.value = '';
    lngInput.value = '';
    clearBtn.hidden = true;
    say('Pin removed. Your shop will be saved without a map location.');
  });

  // ----- 1. Phone location -----
  locateBtn.addEventListener('click', function () {
    if (!navigator.geolocation) return say(P.geoError(), 'warn');
    say('Finding you… allow location if your browser asks.');
    locateBtn.disabled = true;
    navigator.geolocation.getCurrentPosition(function (pos) {
      locateBtn.disabled = false;
      var c = pos.coords;
      var m = Math.round(c.accuracy);
      if (accuracy) map.removeLayer(accuracy);
      accuracy = L.circle([c.latitude, c.longitude], { radius: c.accuracy, color: '#7c3aed', weight: 1, fillOpacity: 0.08, interactive: false }).addTo(map);
      setPin({ lat: c.latitude, lng: c.longitude }, {
        zoom: m > 300 ? 15 : 18,
        keepAccuracy: true,
        message: m > 50
          ? 'Your location is only accurate to about ' + P.formatKm(m / 1000) + ' (shaded circle). Drag the pin onto your exact shop.'
          : '✓ Pinned where you are (accurate to about ' + m + ' m). Drag it if needed.',
      });
    }, function (err) {
      locateBtn.disabled = false;
      say(P.geoError(err), 'warn');
    }, { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 });
  });

  // ----- 2. Search for a place -----
  var county = document.getElementById('county');
  var countyCentre = function () {
    var c = county && centres.find(function (x) { return x[0] === county.value; });
    return c ? { lat: c[1], lng: c[2] } : null;
  };
  var lastSearch = 0;
  function geocode(q) {
    var wait = Math.max(0, 1100 - (Date.now() - lastSearch)); // at most one request a second
    return new Promise(function (r) { setTimeout(r, wait); }).then(function () {
      lastSearch = Date.now();
      var url = 'https://nominatim.openstreetmap.org/search?format=jsonv2&countrycodes=ke&limit=6&accept-language=en&q=' + encodeURIComponent(q);
      var c = countyCentre();
      if (c) url += '&viewbox=' + [c.lng - 0.8, c.lat + 0.8, c.lng + 0.8, c.lat - 0.8].join(','); // prefer the chosen county
      return fetch(url).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); });
    });
  }

  function showResults(list) {
    results.innerHTML = '';
    results.hidden = !list.length;
    list.forEach(function (p) {
      var li = document.createElement('li');
      var b = document.createElement('button');
      b.type = 'button';
      b.textContent = p.display_name.replace(/, Kenya$/, '');
      b.addEventListener('click', function () {
        results.hidden = true;
        map.setView([Number(p.lat), Number(p.lon)], 17);
        say('Map moved to ' + p.display_name.split(',')[0] + '. Now tap your exact shop on the map.');
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
      li.appendChild(b);
      results.appendChild(li);
    });
  }

  function search() {
    var q = searchInput.value.trim();
    if (q.length < 3) return say('Type a place, road, market or landmark near your shop, e.g. "Kangemi market".', 'warn');
    searchBtn.disabled = true;
    say('Searching…');
    geocode(q).then(function (list) {
      searchBtn.disabled = false;
      showResults(list);
      if (!list.length) say('Nothing found for "' + q + '". Try a nearby road, market, school or church, or tap the map.', 'warn');
      else if (list.length === 1) results.querySelector('button').click();
      else say('Choose the right place from the list below the search box.');
    }).catch(function () {
      searchBtn.disabled = false;
      say('Search is not working right now. Tap the map or use your current location instead.', 'warn');
    });
  }
  searchBtn.addEventListener('click', search);
  // Enter in the search box searches the map instead of submitting the whole form.
  searchInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); search(); } });

  // ----- 3. Follow the county / constituency / ward choice (only while there's no pin) -----
  function follow(level) {
    if (marker) return;
    var con = document.getElementById('constituency');
    var ward = document.getElementById('ward');
    var c = countyCentre();
    if (level === 'county') {
      if (c) { map.setView([c.lat, c.lng], 10); say('Showing ' + county.value + ' County. Zoom in and tap your shop, or search for a place.'); }
      return;
    }
    var parts = [ward && ward.value, con && con.value, county.value + ' County'].filter(Boolean);
    if (parts.length < 2) return;
    geocode(parts.join(', ')).then(function (list) {
      if (marker || !list.length) return;
      map.setView([Number(list[0].lat), Number(list[0].lon)], level === 'ward' ? 15 : 13);
      say('Showing ' + parts[0] + '. Zoom in and tap your shop, or search for a nearby place.');
    }).catch(function () {});
  }
  ['county', 'constituency', 'ward'].forEach(function (level) {
    var s = document.getElementById(level);
    if (s) s.addEventListener('change', function () { if (s.value) follow(level); });
  });
  // A new listing with a county already chosen (e.g. after a form error): start there.
  if (!start && countyCentre()) map.setView([countyCentre().lat, countyCentre().lng], 10);
})();
