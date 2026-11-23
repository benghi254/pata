// Shared map helpers for the seller's pin picker (map-picker.js) and the shop page map (listing-map.js).
window.PataMap = (function () {
  var KENYA = { south: -4.9, north: 5.1, west: 33.8, east: 42.0 };

  function tiles(map) {
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map);
  }

  // A big, easy-to-see (and easy-to-grab) pin.
  function pinIcon(extraClass) {
    return L.divIcon({
      className: 'pin-icon' + (extraClass ? ' ' + extraClass : ''),
      html: '<span></span>',
      iconSize: [40, 52],
      iconAnchor: [20, 50],
      tooltipAnchor: [0, -46],
      popupAnchor: [0, -46],
    });
  }

  function youIcon() {
    return L.divIcon({ className: 'you-dot', html: '<span></span>', iconSize: [20, 20], iconAnchor: [10, 10] });
  }

  // The page scrolls over the map instead of zooming it, until the user clicks into the map.
  function wheelOnFocus(map) {
    map.scrollWheelZoom.disable();
    map.on('click focus', function () { map.scrollWheelZoom.enable(); });
    map.getContainer().addEventListener('mouseleave', function () { map.scrollWheelZoom.disable(); });
  }

  // A button that makes the map fill the screen (and back). Esc also closes it.
  function fullscreen(wrap, map, button) {
    function set(on) {
      wrap.classList.toggle('is-full', on);
      document.documentElement.classList.toggle('map-open', on);
      button.setAttribute('aria-pressed', on ? 'true' : 'false');
      button.innerHTML = on ? '✕ Close full screen' : '⛶ Full screen';
      setTimeout(function () { map.invalidateSize(); }, 50);
      if (on) map.scrollWheelZoom.enable();
    }
    button.addEventListener('click', function () { set(!wrap.classList.contains('is-full')); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && wrap.classList.contains('is-full')) set(false); });
    return set;
  }

  function inKenya(lat, lng) {
    return lat >= KENYA.south && lat <= KENYA.north && lng >= KENYA.west && lng <= KENYA.east;
  }

  function distanceKm(a, b) {
    var rad = Math.PI / 180;
    var h = Math.pow(Math.sin((b.lat - a.lat) * rad / 2), 2)
      + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.pow(Math.sin((b.lng - a.lng) * rad / 2), 2);
    return 6371 * 2 * Math.asin(Math.sqrt(h));
  }

  function formatKm(km) {
    return km < 1 ? Math.round(km * 1000 / 10) * 10 + ' m' : (km < 10 ? km.toFixed(1) : Math.round(km)) + ' km';
  }

  // Why the browser couldn't get a location, in plain words.
  function geoError(err) {
    if (!navigator.geolocation) return 'This browser cannot share its location.';
    if (err && err.code === 1) return 'Location is blocked for this site. Allow location for PATA in your browser settings, or use the other options.';
    if (err && err.code === 3) return 'Getting your location took too long. Move near a window or outside and try again.';
    return "Couldn't get your location. Turn on location (GPS) on your phone and try again.";
  }

  return { tiles: tiles, pinIcon: pinIcon, youIcon: youIcon, wheelOnFocus: wheelOnFocus, fullscreen: fullscreen,
    inKenya: inKenya, distanceKm: distanceKm, formatKm: formatKm, geoError: geoError };
})();
