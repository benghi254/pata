// Sell form: map pin picker and opening-hours controls.
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

  // ----- Map pin -----
  var el = document.getElementById('picker');
  if (!el) return;
  if (!window.L) {
    el.innerHTML = '<p class="hint" style="padding:20px">The map could not load. Check your internet connection; you can still submit without a pin.</p>';
    return;
  }

  var latInput = document.getElementById('latitude');
  var lngInput = document.getElementById('longitude');
  var coords = document.getElementById('coords');
  var clearBtn = document.getElementById('clear-pin');
  var locateBtn = document.getElementById('locate');

  var start = latInput.value && lngInput.value ? [Number(latInput.value), Number(lngInput.value)] : null;
  var map = L.map(el, { scrollWheelZoom: false }).setView(start || [-1.2864, 36.8172], start ? 17 : 12); // Nairobi
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  }).addTo(map);

  var marker = null;
  function setPin(latlng, zoom) {
    var lat = Math.round(latlng.lat * 1e6) / 1e6;
    var lng = Math.round(latlng.lng * 1e6) / 1e6;
    if (!marker) {
      marker = L.marker([lat, lng], { draggable: true }).addTo(map);
      marker.on('dragend', function () { setPin(marker.getLatLng()); });
    } else {
      marker.setLatLng([lat, lng]);
    }
    latInput.value = lat;
    lngInput.value = lng;
    coords.textContent = 'Pinned at ' + lat.toFixed(5) + ', ' + lng.toFixed(5);
    clearBtn.hidden = false;
    if (zoom) map.setView([lat, lng], zoom);
  }

  if (start) setPin({ lat: start[0], lng: start[1] });
  map.on('click', function (e) { setPin(e.latlng); });

  clearBtn.addEventListener('click', function () {
    if (marker) { map.removeLayer(marker); marker = null; }
    latInput.value = '';
    lngInput.value = '';
    coords.textContent = '';
    clearBtn.hidden = true;
  });

  locateBtn.addEventListener('click', function () {
    if (!navigator.geolocation) { coords.textContent = 'Your browser cannot share its location.'; return; }
    coords.textContent = 'Finding you…';
    navigator.geolocation.getCurrentPosition(
      function (pos) { setPin({ lat: pos.coords.latitude, lng: pos.coords.longitude }, 17); },
      function () { coords.textContent = "Couldn't get your location. Tap the map instead."; },
      { enableHighAccuracy: true, timeout: 15000 }
    );
  });
})();
