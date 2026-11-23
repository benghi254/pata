// Shop page map: the shop's pin with its name, plus "How far am I?" (shows the buyer's own
// location and the straight-line distance), "Back to shop" and full screen.
// The buyer's location stays in their browser; it isn't sent to PATA.
(function () {
  var el = document.getElementById('shop-map');
  if (!el || !window.L || !window.PataMap) return;
  var P = window.PataMap;
  var shop = { lat: Number(el.dataset.lat), lng: Number(el.dataset.lng) };
  var status = document.getElementById('map-status');
  var showMe = document.getElementById('show-me');
  var recenter = document.getElementById('recenter');

  var map = L.map(el).setView([shop.lat, shop.lng], 17);
  P.tiles(map);
  P.wheelOnFocus(map);
  P.fullscreen(document.getElementById('shop-map-wrap'), map, document.getElementById('map-full'));

  var pin = L.marker([shop.lat, shop.lng], { icon: P.pinIcon(), title: el.dataset.name, alt: el.dataset.name, keyboard: false }).addTo(map);
  pin.bindTooltip(el.dataset.name, { permanent: true, direction: 'top', className: 'shop-label' });
  if (el.dataset.street) pin.bindPopup('<strong></strong><br><span></span>');
  pin.on('popupopen', function (e) {
    var node = e.popup.getElement();
    node.querySelector('strong').textContent = el.dataset.name;
    node.querySelector('span').textContent = el.dataset.street;
  });

  var you = null;
  recenter.addEventListener('click', function () { map.setView([shop.lat, shop.lng], 17); });
  // Offer "Back to shop" only while the map has moved away from it.
  map.on('moveend', function () {
    recenter.hidden = map.getZoom() === 17 && map.getCenter().distanceTo([shop.lat, shop.lng]) < 20;
  });

  showMe.addEventListener('click', function () {
    if (!navigator.geolocation) { status.textContent = P.geoError(); return; }
    status.textContent = 'Finding you… allow location if your browser asks.';
    showMe.disabled = true;
    navigator.geolocation.getCurrentPosition(function (pos) {
      showMe.disabled = false;
      var me = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      if (you) map.removeLayer(you);
      you = L.marker([me.lat, me.lng], { icon: P.youIcon(), title: 'You', keyboard: false }).addTo(map).bindTooltip('You', { direction: 'right' });
      var km = P.distanceKm(me, shop);
      map.fitBounds(L.latLngBounds([me.lat, me.lng], [shop.lat, shop.lng]), { paddingTopLeft: [40, 100], paddingBottomRight: [40, 40], maxZoom: 17 });
      status.textContent = km < 0.05 ? "You're right here!"
        : "You're about " + P.formatKm(km) + ' away in a straight line. Tap Directions for the route.';
    }, function (err) {
      showMe.disabled = false;
      status.textContent = P.geoError(err);
    }, { enableHighAccuracy: true, timeout: 20000, maximumAge: 60000 });
  });
})();
