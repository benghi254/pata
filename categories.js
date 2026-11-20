// Every category on the site. To add one, add an entry here (and an image in public/img).
module.exports = [
  // Goods
  { slug: 'mboga', kind: 'goods', name: 'Mama Mboga', image: 'veges.jpg',
    blurb: 'Find groceries from your local vendors with minimum delivery time.' },
  { slug: 'mutura', kind: 'goods', name: 'Mutura', image: 'donut.jpg',
    blurb: 'For the best mutura in your locality, look here.' },
  { slug: 'clothing', kind: 'goods', name: 'Clothing', image: 'cloth.jpg',
    blurb: 'No need to ship clothing from abroad when you can find sellers here.' },
  { slug: 'food', kind: 'goods', name: 'Foodstuff', image: 'food.jpg',
    blurb: 'Cereals, flour, cooking oil and other foodstuff from sellers near you.' },

  // Services
  { slug: 'kinyozi', kind: 'services', name: 'Barber', image: 'kinyozi.jpg',
    blurb: 'Get that fresh cut from a barber near you.' },
  { slug: 'cleaner', kind: 'services', name: 'House cleaners', image: 'waba.jpg',
    blurb: 'Find people to help you with laundry and cleaning.' },
  { slug: 'tailor', kind: 'services', name: 'Tailors', image: 'tailor.jpg',
    blurb: 'The best tailors you have never heard of are all here.' },
  { slug: 'technician', kind: 'services', name: 'Technicians', image: 'plumber.jpg',
    blurb: 'Plumbers, electricians, painters and other fundis near you.' },
];
