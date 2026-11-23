// Search-engine helpers: listing URLs, page descriptions and schema.org structured data.
const hours = require('./hours');
const { photoFor } = require('./categories');

function slugify(text) {
  return String(text)
    .toLowerCase()
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'shop';
}

// e.g. /listing/12/mama-wambo-kangemi
function listingPath(l) {
  return `/listing/${l.id}/${slugify(`${l.shop_name} ${l.ward || l.constituency || l.county}`)}`;
}

function place(l) {
  return [l.ward, l.constituency, l.county].filter(Boolean).join(', ');
}

function listingDescription(l, category) {
  const base = `${l.shop_name}: ${l.title} in ${place(l)}. ${category.name} on PATA.`;
  const extra = l.description ? ` ${l.description}` : '';
  return (base + extra).replace(/\s+/g, ' ').slice(0, 160);
}

// schema.org LocalBusiness (or a more specific type) for one listing.
function listingJsonLd(l, category, siteUrl) {
  const url = siteUrl + listingPath(l);
  const data = {
    '@context': 'https://schema.org',
    '@type': category.schemaType || 'LocalBusiness',
    '@id': `${url}#business`,
    name: l.shop_name,
    description: l.description || `${l.title} in ${place(l)}`,
    url,
    image: siteUrl + photoFor(category),
    telephone: l.phone,
    address: {
      '@type': 'PostalAddress',
      streetAddress: l.street || undefined,
      addressLocality: l.ward || l.constituency || undefined,
      addressRegion: l.county,
      addressCountry: 'KE',
    },
    openingHoursSpecification: hours.toSchema(hours.parse(l.hours)),
  };
  if (l.website) data.sameAs = [l.website];
  if (l.pay_method && l.pay_number) data.paymentAccepted = ['Cash', l.pay_method === 'airtel' ? 'Airtel Money' : 'M-Pesa'];
  if (l.latitude != null && l.longitude != null) {
    data.geo = { '@type': 'GeoCoordinates', latitude: l.latitude, longitude: l.longitude };
    data.hasMap = `https://www.google.com/maps/search/?api=1&query=${l.latitude},${l.longitude}`;
  }
  return data;
}

function breadcrumbs(siteUrl, items) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map(([name, path], i) => ({
      '@type': 'ListItem', position: i + 1, name, item: siteUrl + path,
    })),
  };
}

// Safe to drop inside <script type="application/ld+json">.
function jsonLdScript(data) {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}

const xmlEscape = (s) => String(s).replace(/[<>&'"]/g, (c) => (
  { '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]
));

module.exports = { slugify, listingPath, place, listingDescription, listingJsonLd, breadcrumbs, jsonLdScript, xmlEscape };
