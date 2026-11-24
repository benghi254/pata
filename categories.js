// Every category on the site. To add one, add an entry to the right group below.
//   slug        URL name (never change it once listings use it)
//   image       optional photo in public/img; without one the category shows its icon
//   icon, hue   emoji and tile colour (0-360) used when there is no photo
//   schemaType  schema.org business type search engines see for its listings
//   (a group can set photo: for link previews of its categories that have none)
//   keywords    extra words the home-page search matches (Swahili and slang welcome)

const GROUPS = [
  {
    kind: 'goods', name: 'Goods', items: [
      { slug: 'mboga', name: 'Mama Mboga', image: 'veges.jpg', icon: '🥬', hue: 120, schemaType: 'GroceryStore',
        blurb: 'Find groceries from your local vendors with minimum delivery time.', keywords: 'vegetables sukuma fruits' },
      { slug: 'mutura', name: 'Mutura', image: 'donut.jpg', icon: '🍢', hue: 20, schemaType: 'FoodEstablishment',
        blurb: 'For the best mutura in your locality, look here.', keywords: 'nyama choma street food' },
      { slug: 'fastfood', name: 'Chips & fast food', image: 'vanga.jpg', icon: '🍟', hue: 40, schemaType: 'FastFoodRestaurant',
        blurb: 'Chips, smokies, bhajia and quick bites from vendors near you.', keywords: 'chips fries smokie bhajia samosa' },
      { slug: 'food', name: 'Foodstuff', image: 'food.jpg', icon: '🌾', hue: 45, schemaType: 'GroceryStore',
        blurb: 'Cereals, flour, cooking oil and other foodstuff from sellers near you.', keywords: 'unga flour rice beans cereals' },
      { slug: 'clothing', name: 'Clothing', image: 'cloth.jpg', icon: '👕', hue: 280, schemaType: 'ClothingStore',
        blurb: 'No need to ship clothing from abroad when you can find sellers here.', keywords: 'mitumba clothes dresses' },
      { slug: 'shoes', name: 'Shoes', image: 'gwanda.jpg', icon: '👟', hue: 200, schemaType: 'ShoeStore',
        blurb: 'Sneakers, official shoes and sandals from local sellers.', keywords: 'sneakers viatu open shoes' },
      { slug: 'general-shop', name: 'General shops (duka)', icon: '🏪', hue: 55, schemaType: 'ConvenienceStore',
        blurb: 'Your neighbourhood duka or kiosk for everyday household items.', keywords: 'duka kiosk shop retail household airtime sugar bread milk' },
      { slug: 'supermarket', name: 'Supermarkets & minimarts', icon: '🛒', hue: 140, schemaType: 'GroceryStore',
        blurb: 'Supermarkets, minimarts and shopping marts near you.', keywords: 'supermarket minimart mart shopping wholesale groceries' },
    ],
  },
  {
    kind: 'services', name: 'Home repairs & maintenance', items: [
      { slug: 'technician', name: 'Handyman / fundi', image: 'plumber.jpg', icon: '🧰', hue: 210, schemaType: 'HomeAndConstructionBusiness',
        blurb: 'All-round fundis for small repairs and fittings around the home.', keywords: 'fundi technician repairs handyman' },
      { slug: 'plumber', name: 'Plumbers', icon: '🚰', hue: 195, schemaType: 'Plumber',
        blurb: 'Leaking taps, blocked drains, water tanks and pipe fitting.', keywords: 'fundi wa maji pipes taps drainage tank' },
      { slug: 'electrician', name: 'Electricians', icon: '⚡', hue: 48, schemaType: 'Electrician',
        blurb: 'Wiring, sockets, lighting, meters and electrical faults.', keywords: 'fundi wa stima wiring power tokens' },
      { slug: 'painter', name: 'Painters', image: 'rangi.jpg', icon: '🎨', hue: 330, schemaType: 'HousePainter',
        blurb: 'Interior and exterior painting, finishing and wall design.', keywords: 'rangi painting walls' },
      { slug: 'carpenter', name: 'Carpenters', icon: '🪚', hue: 30, schemaType: 'HomeAndConstructionBusiness',
        blurb: 'Furniture, doors, kitchen cabinets, beds and wood repairs.', keywords: 'fundi wa mbao furniture wood' },
      { slug: 'welder', name: 'Welders & fabricators', icon: '🔥', hue: 15, schemaType: 'HomeAndConstructionBusiness',
        blurb: 'Gates, window grills, metal doors and steel structures.', keywords: 'welding gates grills jua kali metal' },
      { slug: 'locksmith', name: 'Locksmiths & key cutting', icon: '🔑', hue: 260, schemaType: 'Locksmith',
        blurb: 'Locks fitted and repaired, keys cut, lockouts opened.', keywords: 'keys locks padlock' },
      { slug: 'glass', name: 'Glass & aluminium', icon: '🪟', hue: 185, schemaType: 'HomeAndConstructionBusiness',
        blurb: 'Windows, mirrors, shower screens and aluminium fittings.', keywords: 'windows mirror aluminium glazier' },
      { slug: 'appliance-repair', name: 'Appliance repair', icon: '🔌', hue: 225, schemaType: 'LocalBusiness',
        blurb: 'Fridges, cookers, washing machines, microwaves and TVs.', keywords: 'fridge tv cooker washing machine repair' },
    ],
  },
  {
    kind: 'services', name: 'Building & construction', photo: 'rangi.jpg', items: [
      { slug: 'mason', name: 'Masons', icon: '🧱', hue: 10, schemaType: 'GeneralContractor',
        blurb: 'Building, plastering, walls, foundations and stone work.', keywords: 'fundi wa mawe builder plaster construction' },
      { slug: 'casual-labour', name: 'Casual labourers (mjengo)', icon: '👷', hue: 35, schemaType: 'GeneralContractor',
        blurb: 'Hands for digging, loading, site work and heavy lifting.', keywords: 'mjengo kibarua labourer digging loading' },
      { slug: 'tiler', name: 'Tilers & flooring', icon: '🔲', hue: 240, schemaType: 'HomeAndConstructionBusiness',
        blurb: 'Floor and wall tiles, terrazzo, cabro and flooring.', keywords: 'tiles terrazzo cabro floor' },
      { slug: 'roofer', name: 'Roofers', icon: '🏠', hue: 0, schemaType: 'RoofingContractor',
        blurb: 'Roof installation, iron sheets, tiles, gutters and leak repair.', keywords: 'mabati roofing gutters leaks' },
      { slug: 'gypsum', name: 'Gypsum & ceilings', icon: '📐', hue: 270, schemaType: 'HomeAndConstructionBusiness',
        blurb: 'Gypsum ceilings, partitions and interior finishing.', keywords: 'ceiling gypsum partitions interior' },
    ],
  },
  {
    kind: 'services', name: 'Cleaning & household', items: [
      { slug: 'cleaner', name: 'House cleaners', image: 'waba.jpg', icon: '🧽', hue: 170, schemaType: 'LocalBusiness',
        blurb: 'Find people to help you with house cleaning and deep cleans.', keywords: 'cleaning deep clean house' },
      { slug: 'laundry', name: 'Laundry (mama fua)', image: 'clean.jpg', icon: '🧺', hue: 205, schemaType: 'DryCleaningOrLaundry',
        blurb: 'Washing, ironing and dry cleaning, at home or picked up.', keywords: 'mama fua washing ironing dry cleaning' },
      { slug: 'house-help', name: 'House helps & nannies', icon: '👶', hue: 340, schemaType: 'ChildCare',
        blurb: 'Day and live-in house helps, nannies and caregivers.', keywords: 'house girl nanny caregiver domestic worker' },
      { slug: 'pest-control', name: 'Fumigation & pest control', icon: '🪳', hue: 90, schemaType: 'HomeAndConstructionBusiness',
        blurb: 'Bedbugs, cockroaches, termites, rats and mosquitoes.', keywords: 'fumigation bedbugs cockroaches termites' },
      { slug: 'gardener', name: 'Gardeners & landscaping', icon: '🌿', hue: 130, schemaType: 'HomeAndConstructionBusiness',
        blurb: 'Lawn mowing, hedges, flower beds and compound care.', keywords: 'shamba boy garden lawn landscaping' },
      { slug: 'garbage', name: 'Garbage collection', icon: '♻️', hue: 150, schemaType: 'LocalBusiness',
        blurb: 'Regular rubbish pick-up and waste removal.', keywords: 'taka rubbish waste collection' },
      { slug: 'water-delivery', name: 'Water delivery', icon: '💧', hue: 200, schemaType: 'LocalBusiness',
        blurb: 'Water by bowser, mkokoteni or jerrycan to your door.', keywords: 'maji bowser jerrycan water vendor' },
      { slug: 'exhauster', name: 'Exhauster services', icon: '🚛', hue: 25, schemaType: 'LocalBusiness',
        blurb: 'Septic tank and pit emptying and sewer unblocking.', keywords: 'septic tank exhauster sewer' },
    ],
  },
  {
    kind: 'services', name: 'Beauty & personal care', items: [
      { slug: 'kinyozi', name: 'Barber', image: 'kinyozi.jpg', icon: '💈', hue: 0, schemaType: 'HairSalon',
        blurb: 'Get that fresh cut from a barber near you.', keywords: 'kinyozi haircut shave fade' },
      { slug: 'salon', name: 'Hair salons & braiding', icon: '💇', hue: 320, schemaType: 'HairSalon',
        blurb: 'Braids, weaves, locs, relaxing and styling.', keywords: 'salon braids weaves dreadlocks locs' },
      { slug: 'nails', name: 'Nail technicians', icon: '💅', hue: 300, schemaType: 'NailSalon',
        blurb: 'Manicures, pedicures, gel and acrylic nails.', keywords: 'manicure pedicure gel acrylic' },
      { slug: 'makeup', name: 'Makeup artists', icon: '💄', hue: 350, schemaType: 'BeautySalon',
        blurb: 'Makeup for weddings, events and photo shoots.', keywords: 'makeup mua bridal' },
      { slug: 'massage', name: 'Massage & spa', icon: '💆', hue: 280, schemaType: 'DaySpa',
        blurb: 'Relaxing and therapeutic massage, facials and spa care.', keywords: 'massage spa facial' },
    ],
  },
  {
    kind: 'services', name: 'Tailoring & crafts', items: [
      { slug: 'tailor', name: 'Tailors', image: 'tailor.jpg', icon: '🧵', hue: 265, schemaType: 'LocalBusiness',
        blurb: 'The best tailors you have never heard of are all here.', keywords: 'fundi wa nguo sewing alterations dresses' },
      { slug: 'cobbler', name: 'Shoe repair (cobblers)', icon: '👞', hue: 25, schemaType: 'LocalBusiness',
        blurb: 'Shoe repair, polishing, resoling and bag repair.', keywords: 'fundi wa viatu shoe shine polish' },
      { slug: 'upholstery', name: 'Upholstery', icon: '🛋️', hue: 290, schemaType: 'LocalBusiness',
        blurb: 'Sofa making, re-covering, cushions and car seats.', keywords: 'sofa seats cushions' },
    ],
  },
  {
    kind: 'services', name: 'Vehicles & transport', items: [
      { slug: 'mechanic', name: 'Mechanics', image: 'mech.jpg', icon: '🔧', hue: 215, schemaType: 'AutoRepair',
        blurb: 'Car service, engine repair, brakes, suspension and diagnostics.', keywords: 'garage car repair engine service' },
      { slug: 'car-wash', name: 'Car wash', icon: '🚿', hue: 190, schemaType: 'AutoWash',
        blurb: 'Car wash, interior cleaning and detailing.', keywords: 'carwash detailing' },
      { slug: 'boda', name: 'Boda boda riders', icon: '🏍️', hue: 10, schemaType: 'TaxiService',
        blurb: 'Fast rides and parcel delivery around your area.', keywords: 'boda bodaboda motorbike rider delivery' },
      { slug: 'movers', name: 'Movers & transport', icon: '🚚', hue: 35, schemaType: 'MovingCompany',
        blurb: 'House moving, pick-ups, lorries and goods transport.', keywords: 'moving lorry pickup transport relocation' },
      { slug: 'driver', name: 'Drivers', icon: '🚗', hue: 230, schemaType: 'LocalBusiness',
        blurb: 'Personal, school-run and long-distance drivers for hire.', keywords: 'dereva chauffeur driver for hire' },
    ],
  },
  {
    kind: 'services', name: 'Tech & electronics', items: [
      { slug: 'phone-repair', name: 'Phone & computer repair', icon: '📱', hue: 250, schemaType: 'LocalBusiness',
        blurb: 'Screens, batteries, software, laptops and accessories.', keywords: 'phone screen laptop computer repair' },
      { slug: 'installer', name: 'TV, DSTV & CCTV installers', icon: '📡', hue: 205, schemaType: 'LocalBusiness',
        blurb: 'Dish and decoder set-up, TV mounting, CCTV and alarms.', keywords: 'dstv gotv decoder cctv camera tv mounting' },
      { slug: 'cyber', name: 'Cyber & printing', icon: '🖨️', hue: 180, schemaType: 'LocalBusiness',
        blurb: 'Printing, photocopy, typing, eCitizen and KRA services.', keywords: 'cyber cafe printing photocopy ecitizen kra' },
    ],
  },
  {
    kind: 'services', name: 'Events & food', photo: 'dip.jpg', items: [
      { slug: 'caterer', name: 'Caterers & cooks', icon: '🍲', hue: 30, schemaType: 'LocalBusiness',
        blurb: 'Cooking for weddings, parties, funerals and offices.', keywords: 'catering cook chef events' },
      { slug: 'photographer', name: 'Photographers & video', icon: '📷', hue: 260, schemaType: 'ProfessionalService',
        blurb: 'Photos and video for weddings, events and products.', keywords: 'photography videographer shoot' },
      { slug: 'dj', name: 'DJs & sound', icon: '🎧', hue: 300, schemaType: 'ProfessionalService',
        blurb: 'DJs, MCs, PA systems and sound for any event.', keywords: 'dj mc sound system pa' },
      { slug: 'tents', name: 'Tents, chairs & decor', icon: '⛺', hue: 160, schemaType: 'LocalBusiness',
        blurb: 'Tents, chairs, tables and decoration hire.', keywords: 'tents chairs hire decor events' },
    ],
  },
  {
    kind: 'services', name: 'Lessons, care & security', items: [
      { slug: 'tutor', name: 'Tutors & lessons', icon: '📚', hue: 220, schemaType: 'ProfessionalService',
        blurb: 'Home tuition, music, driving and language lessons.', keywords: 'tuition teacher lessons tutor' },
      { slug: 'security', name: 'Security guards', icon: '🛡️', hue: 210, schemaType: 'ProfessionalService',
        blurb: 'Watchmen, guards and event security.', keywords: 'watchman askari guard security' },
      { slug: 'vet', name: 'Vets & animal care', icon: '🐄', hue: 95, schemaType: 'VeterinaryCare',
        blurb: 'Animal health, vaccination and farm animal care.', keywords: 'veterinary vet animals livestock dog' },
      { slug: 'farm-labour', name: 'Farm workers', icon: '🚜', hue: 75, schemaType: 'LocalBusiness',
        blurb: 'Planting, weeding, harvesting, ploughing and spraying.', keywords: 'shamba farm planting harvesting ploughing' },
    ],
  },
];

const categories = GROUPS.flatMap((g) => g.items.map((c) => ({ ...c, kind: g.kind, group: g.name, groupPhoto: g.photo })));

module.exports = categories;
module.exports.GROUPS = GROUPS.map((g) => ({
  kind: g.kind, name: g.name, items: categories.filter((c) => c.group === g.name),
}));

// Photo for link previews and search results. Categories without their own photo borrow
// one from their group, so shared links always show a picture.
module.exports.photoFor = (c) => {
  const own = c.image || c.groupPhoto || (categories.find((o) => o.group === c.group && o.image) || {}).image;
  return `/img/${own || (c.kind === 'goods' ? 'veges.jpg' : 'plumber.jpg')}`;
};
