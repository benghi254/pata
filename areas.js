// Kenya's 47 counties, used by search to work out "your area".
//   lat, lng  rough centre (the county town), used to guess which county a buyer is in
//             from their browser location. It is only a guess, so pages say so and
//             let the buyer change it.
const COUNTIES = [
  ['Mombasa', -4.04, 39.67], ['Kwale', -4.17, 39.45], ['Kilifi', -3.51, 39.91], ['Tana River', -1.50, 40.03],
  ['Lamu', -2.27, 40.90], ['Taita Taveta', -3.40, 38.56], ['Garissa', -0.45, 39.65], ['Wajir', 1.75, 40.06],
  ['Mandera', 3.94, 41.86], ['Marsabit', 2.33, 37.99], ['Isiolo', 0.35, 37.58], ['Meru', 0.05, 37.65],
  ['Tharaka Nithi', -0.30, 37.80], ['Embu', -0.54, 37.46], ['Kitui', -1.37, 38.01], ['Machakos', -1.52, 37.26],
  ['Makueni', -1.80, 37.62], ['Nyandarua', -0.27, 36.38], ['Nyeri', -0.42, 36.95], ['Kirinyaga', -0.50, 37.28],
  ["Murang'a", -0.72, 37.15], ['Kiambu', -1.10, 36.85], ['Turkana', 3.12, 35.60], ['West Pokot', 1.24, 35.11],
  ['Samburu', 1.10, 36.70], ['Trans Nzoia', 1.02, 35.00], ['Uasin Gishu', 0.51, 35.27], ['Elgeyo Marakwet', 0.67, 35.51],
  ['Nandi', 0.20, 35.10], ['Baringo', 0.49, 35.74], ['Laikipia', 0.20, 36.80], ['Nakuru', -0.30, 36.07],
  ['Narok', -1.08, 35.87], ['Kajiado', -1.85, 36.78], ['Kericho', -0.37, 35.28], ['Bomet', -0.78, 35.34],
  ['Kakamega', 0.28, 34.75], ['Vihiga', 0.08, 34.72], ['Bungoma', 0.56, 34.56], ['Busia', 0.46, 34.11],
  ['Siaya', 0.06, 34.29], ['Kisumu', -0.09, 34.77], ['Homa Bay', -0.53, 34.46], ['Migori', -1.06, 34.47],
  ['Kisii', -0.68, 34.77], ['Nyamira', -0.56, 34.94], ['Nairobi', -1.29, 36.82],
].map(([name, lat, lng]) => ({ name, lat, lng }));

// Sellers type their area by hand, so compare names loosely:
// "Nairobi County", "nairobi" and " Nairobi " are the same place; so are "Murang'a" and "Muranga".
const norm = (s) => String(s || '').toLowerCase().replace(/(county|constituency|ward)/g, '').replace(/[^a-z]/g, '');

// Same rule in SQL, for a column name.
const normSql = (col) => `regexp_replace(regexp_replace(lower(${col}), '(county|constituency|ward)', '', 'g'), '[^a-z]', '', 'g')`;

function distanceKm(lat1, lng1, lat2, lng2) {
  const rad = Math.PI / 180;
  const a = Math.sin(((lat2 - lat1) * rad) / 2) ** 2
    + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(((lng2 - lng1) * rad) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(a));
}

// Great-circle distance in km from (?, ?) to a listing's pin, in SQL. NULL when it has no pin.
const distanceSql = `6371 * 2 * asin(sqrt(
  power(sin(radians(latitude - ?) / 2), 2) +
  cos(radians(?)) * cos(radians(latitude)) * power(sin(radians(longitude - ?) / 2), 2)))`;

const nearestCounty = (lat, lng) => COUNTIES.reduce((best, c) => (
  distanceKm(lat, lng, c.lat, c.lng) < distanceKm(lat, lng, best.lat, best.lng) ? c : best));

const countyByName = (name) => COUNTIES.find((c) => norm(c.name) === norm(name));

// Kenya's 290 constituencies (IEBC, 2012 boundaries), by county. Buyers only see shops in
// the constituency they pick, so sellers choose theirs from this same list.
const CONSTITUENCIES = {
  Mombasa: ['Changamwe', 'Jomvu', 'Kisauni', 'Nyali', 'Likoni', 'Mvita'],
  Kwale: ['Msambweni', 'Lunga Lunga', 'Matuga', 'Kinango'],
  Kilifi: ['Kilifi North', 'Kilifi South', 'Kaloleni', 'Rabai', 'Ganze', 'Malindi', 'Magarini'],
  'Tana River': ['Garsen', 'Galole', 'Bura'],
  Lamu: ['Lamu East', 'Lamu West'],
  'Taita Taveta': ['Taveta', 'Wundanyi', 'Mwatate', 'Voi'],
  Garissa: ['Garissa Township', 'Balambala', 'Lagdera', 'Dadaab', 'Fafi', 'Ijara'],
  Wajir: ['Wajir North', 'Wajir East', 'Tarbaj', 'Wajir West', 'Eldas', 'Wajir South'],
  Mandera: ['Mandera West', 'Banissa', 'Mandera North', 'Mandera South', 'Mandera East', 'Lafey'],
  Marsabit: ['Moyale', 'North Horr', 'Saku', 'Laisamis'],
  Isiolo: ['Isiolo North', 'Isiolo South'],
  Meru: ['Igembe South', 'Igembe Central', 'Igembe North', 'Tigania West', 'Tigania East', 'North Imenti', 'Buuri', 'Central Imenti', 'South Imenti'],
  'Tharaka Nithi': ['Maara', "Chuka/Igambang'ombe", 'Tharaka'],
  Embu: ['Manyatta', 'Runyenjes', 'Mbeere South', 'Mbeere North'],
  Kitui: ['Mwingi North', 'Mwingi West', 'Mwingi Central', 'Kitui West', 'Kitui Rural', 'Kitui Central', 'Kitui East', 'Kitui South'],
  Machakos: ['Masinga', 'Yatta', 'Kangundo', 'Matungulu', 'Kathiani', 'Mavoko', 'Machakos Town', 'Mwala'],
  Makueni: ['Mbooni', 'Kilome', 'Kaiti', 'Makueni', 'Kibwezi West', 'Kibwezi East'],
  Nyandarua: ['Kinangop', 'Kipipiri', 'Ol Kalou', 'Ol Jorok', 'Ndaragwa'],
  Nyeri: ['Tetu', 'Kieni', 'Mathira', 'Othaya', 'Mukurweini', 'Nyeri Town'],
  Kirinyaga: ['Mwea', 'Gichugu', 'Ndia', 'Kirinyaga Central'],
  "Murang'a": ['Kangema', 'Mathioya', 'Kiharu', 'Kigumo', 'Maragwa', 'Kandara', 'Gatanga'],
  Kiambu: ['Gatundu South', 'Gatundu North', 'Juja', 'Thika Town', 'Ruiru', 'Githunguri', 'Kiambu', 'Kiambaa', 'Kabete', 'Kikuyu', 'Limuru', 'Lari'],
  Turkana: ['Turkana North', 'Turkana West', 'Turkana Central', 'Loima', 'Turkana South', 'Turkana East'],
  'West Pokot': ['Kapenguria', 'Sigor', 'Kacheliba', 'Pokot South'],
  Samburu: ['Samburu West', 'Samburu North', 'Samburu East'],
  'Trans Nzoia': ['Kwanza', 'Endebess', 'Saboti', 'Kiminini', 'Cherangany'],
  'Uasin Gishu': ['Soy', 'Turbo', 'Moiben', 'Ainabkoi', 'Kapseret', 'Kesses'],
  'Elgeyo Marakwet': ['Marakwet East', 'Marakwet West', 'Keiyo North', 'Keiyo South'],
  Nandi: ['Tinderet', 'Aldai', 'Nandi Hills', 'Chesumei', 'Emgwen', 'Mosop'],
  Baringo: ['Tiaty', 'Baringo North', 'Baringo Central', 'Baringo South', 'Mogotio', 'Eldama Ravine'],
  Laikipia: ['Laikipia West', 'Laikipia East', 'Laikipia North'],
  Nakuru: ['Molo', 'Njoro', 'Naivasha', 'Gilgil', 'Kuresoi South', 'Kuresoi North', 'Subukia', 'Rongai', 'Bahati', 'Nakuru Town West', 'Nakuru Town East'],
  Narok: ['Kilgoris', 'Emurua Dikirr', 'Narok North', 'Narok East', 'Narok South', 'Narok West'],
  Kajiado: ['Kajiado North', 'Kajiado Central', 'Kajiado East', 'Kajiado West', 'Kajiado South'],
  Kericho: ['Kipkelion East', 'Kipkelion West', 'Ainamoi', 'Bureti', 'Belgut', 'Sigowet/Soin'],
  Bomet: ['Sotik', 'Chepalungu', 'Bomet East', 'Bomet Central', 'Konoin'],
  Kakamega: ['Lugari', 'Likuyani', 'Malava', 'Lurambi', 'Navakholo', 'Mumias West', 'Mumias East', 'Matungu', 'Butere', 'Khwisero', 'Shinyalu', 'Ikolomani'],
  Vihiga: ['Vihiga', 'Sabatia', 'Hamisi', 'Luanda', 'Emuhaya'],
  Bungoma: ['Mt. Elgon', 'Sirisia', 'Kabuchai', 'Bumula', 'Kanduyi', 'Webuye East', 'Webuye West', 'Kimilili', 'Tongaren'],
  Busia: ['Teso North', 'Teso South', 'Nambale', 'Matayos', 'Butula', 'Funyula', 'Budalangi'],
  Siaya: ['Ugenya', 'Ugunja', 'Alego Usonga', 'Gem', 'Bondo', 'Rarieda'],
  Kisumu: ['Kisumu East', 'Kisumu West', 'Kisumu Central', 'Seme', 'Nyando', 'Muhoroni', 'Nyakach'],
  'Homa Bay': ['Kasipul', 'Kabondo Kasipul', 'Karachuonyo', 'Rangwe', 'Homa Bay Town', 'Ndhiwa', 'Suba North', 'Suba South'],
  Migori: ['Rongo', 'Awendo', 'Suna East', 'Suna West', 'Uriri', 'Nyatike', 'Kuria West', 'Kuria East'],
  Kisii: ['Bonchari', 'South Mugirango', 'Bomachoge Borabu', 'Bobasi', 'Bomachoge Chache', 'Nyaribari Masaba', 'Nyaribari Chache', 'Kitutu Chache North', 'Kitutu Chache South'],
  Nyamira: ['Kitutu Masaba', 'West Mugirango', 'North Mugirango', 'Borabu'],
  Nairobi: ['Westlands', 'Dagoretti North', 'Dagoretti South', "Lang'ata", 'Kibra', 'Roysambu', 'Kasarani', 'Ruaraka', 'Embakasi South', 'Embakasi North', 'Embakasi Central', 'Embakasi East', 'Embakasi West', 'Makadara', 'Kamukunji', 'Starehe', 'Mathare'],
};

// Counties A-Z, each with its constituencies A-Z, for the pickers.
const PLACES = COUNTIES.map((c) => ({ county: c.name, constituencies: [...CONSTITUENCIES[c.name]].sort() }))
  .sort((a, b) => a.county.localeCompare(b.county));

// The official { county, constituency } for loosely typed names, or null if they don't match.
function findPlace(countyName, constituencyName) {
  const county = countyByName(countyName);
  if (!county) return null;
  const constituency = CONSTITUENCIES[county.name].find((c) => norm(c) === norm(constituencyName));
  return constituency ? { county: county.name, constituency } : null;
}

module.exports = {
  COUNTIES, CONSTITUENCIES, PLACES, norm, normSql, distanceSql, distanceKm, nearestCounty, countyByName, findPlace,
};
