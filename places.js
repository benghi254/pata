// Kenya's counties, constituencies and wards (47 / 290 / 1,450, as set by the IEBC), for the
// County -> Constituency -> Ward pickers on the sell form and in search.
// places.json is { county: { constituency: [ward, ...] } }, generated from the MIT-licensed
// kenya-locations dataset (github.com/davidamunga/kenya-locations), names tidied to title case.
const crypto = require('node:crypto');
const { norm } = require('./areas');

// require() (not fs) so Vercel's bundler always ships the file with the function.
const TREE = require('./places.json');
const RAW = JSON.stringify(TREE);
// Changes whenever the data does, so browsers can cache /places.json for a long time.
const VERSION = crypto.createHash('sha1').update(RAW).digest('hex').slice(0, 10);

const COUNTIES = Object.keys(TREE).sort((a, b) => a.localeCompare(b, 'en'));

// The official spelling of `name` in `list`, matched loosely ("nairobi county" -> "Nairobi").
const pick = (list, name) => (name ? list.find((x) => norm(x) === norm(name)) || null : null);

const county = (name) => pick(COUNTIES, name);
const constituenciesOf = (countyName) => {
  const c = county(countyName);
  return c ? Object.keys(TREE[c]) : [];
};
const constituency = (countyName, name) => pick(constituenciesOf(countyName), name);
const wardsOf = (countyName, constituencyName) => {
  const c = county(countyName);
  const k = c && constituency(c, constituencyName);
  return k ? TREE[c][k] : [];
};
const ward = (countyName, constituencyName, name) => pick(wardsOf(countyName, constituencyName), name);

// Checks a county / constituency / ward choice and returns the official names.
// `keep` is what a listing already has saved: older listings typed these freely, so a value that
// isn't on the official list is still accepted while it stays unchanged.
function check(input, { requireCounty = true, keep = {} } = {}) {
  const errors = [];
  const out = { county: '', constituency: '', ward: '' };
  const same = (field) => input[field] && keep[field] && input[field] === keep[field];

  out.county = county(input.county) || (same('county') ? input.county : '');
  if (!out.county) {
    if (input.county) errors.push('Choose your county from the list.');
    else if (requireCounty) errors.push('County is required.');
    return { ...out, errors };
  }
  if (input.constituency) {
    out.constituency = constituency(out.county, input.constituency) || (same('constituency') ? input.constituency : '');
    if (!out.constituency) errors.push(`Choose a constituency in ${out.county} County from the list.`);
  }
  if (input.ward) {
    if (!out.constituency) {
      if (!errors.length) errors.push('Choose the constituency before the ward.');
    } else {
      out.ward = ward(out.county, out.constituency, input.ward) || (same('ward') ? input.ward : '');
      if (!out.ward) errors.push(`Choose a ward in ${out.constituency} from the list.`);
    }
  }
  return { ...out, errors };
}

module.exports = { RAW, VERSION, COUNTIES, county, constituenciesOf, constituency, wardsOf, ward, check };
