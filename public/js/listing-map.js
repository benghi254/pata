// Shows a shop's pin on its listing page.
(function () {
  var el = document.getElementById('shop-map');
  if (!el || !window.L) return;
  var pos = [Number(el.dataset.lat), Number(el.dataset.lng)];
  var map = L.map(el, { scrollWheelZoom: false }).setView(pos, 17);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  }).addTo(map);
  L.marker(pos, { title: el.dataset.name, alt: el.dataset.name }).addTo(map);
})();
