// Every category on the site. To add one, add an entry here (and an image in public/img).
// schemaType is the schema.org business type search engines see for listings in it.
module.exports = [
  // Goods
  { slug: 'mboga', kind: 'goods', name: 'Mama Mboga', image: 'veges.jpg', schemaType: 'GroceryStore',
    blurb: 'Find groceries from your local vendors with minimum delivery time.' },
  { slug: 'mutura', kind: 'goods', name: 'Mutura', image: 'donut.jpg', schemaType: 'FoodEstablishment',
    blurb: 'For the best mutura in your locality, look here.' },
  { slug: 'clothing', kind: 'goods', name: 'Clothing', image: 'cloth.jpg', schemaType: 'ClothingStore',
    blurb: 'No need to ship clothing from abroad when you can find sellers here.' },
  { slug: 'food', kind: 'goods', name: 'Foodstuff', image: 'food.jpg', schemaType: 'GroceryStore',
    blurb: 'Cereals, flour, cooking oil and other foodstuff from sellers near you.' },

  // Services
  { slug: 'kinyozi', kind: 'services', name: 'Barber', image: 'kinyozi.jpg', schemaType: 'HairSalon',
    blurb: 'Get that fresh cut from a barber near you.' },
  { slug: 'cleaner', kind: 'services', name: 'House cleaners', image: 'waba.jpg', schemaType: 'LocalBusiness',
    blurb: 'Find people to help you with laundry and cleaning.' },
  { slug: 'tailor', kind: 'services', name: 'Tailors', image: 'tailor.jpg', schemaType: 'LocalBusiness',
    blurb: 'The best tailors you have never heard of are all here.' },
  { slug: 'technician', kind: 'services', name: 'Technicians', image: 'plumber.jpg', schemaType: 'HomeAndConstructionBusiness',
    blurb: 'Plumbers, electricians, painters and other fundis near you.' },
];
