// GarmentCategories — the supported category taxonomy for the wardrobe.
export const GARMENT_CATEGORIES = [
  { id: 'tshirts', name: 'T-Shirts', group: 'tops', subcategories: ['Basic', 'Graphic', 'Polo', 'Long Sleeve'] },
  { id: 'shirts', name: 'Shirts', group: 'tops', subcategories: ['Dress Shirt', 'Casual', 'Flannel', 'Blouse'] },
  { id: 'jackets', name: 'Jackets', group: 'tops', subcategories: ['Bomber', 'Denim', 'Leather', 'Blazer', 'Parka'] },
  { id: 'hoodies', name: 'Hoodies', group: 'tops', subcategories: ['Pullover', 'Zip-Up', 'Cropped'] },
  { id: 'sweaters', name: 'Sweaters', group: 'tops', subcategories: ['Crewneck', 'V-Neck', 'Turtleneck', 'Cardigan'] },
  { id: 'pants', name: 'Pants', group: 'bottoms', subcategories: ['Chinos', 'Trousers', 'Cargo', 'Leggings'] },
  { id: 'shorts', name: 'Shorts', group: 'bottoms', subcategories: ['Casual', 'Denim', 'Athletic'] },
  { id: 'jeans', name: 'Jeans', group: 'bottoms', subcategories: ['Skinny', 'Straight', 'Bootcut', 'Wide Leg'] },
  { id: 'skirts', name: 'Skirts', group: 'bottoms', subcategories: ['Mini', 'Midi', 'Maxi', 'Pencil', 'Pleated'] },
  { id: 'dresses', name: 'Dresses', group: 'dresses', subcategories: ['Casual', 'Cocktail', 'Evening', 'Summer'] },
  { id: 'shoes', name: 'Shoes', group: 'footwear', subcategories: ['Oxford', 'Loafers', 'Heels', 'Flats'] },
  { id: 'boots', name: 'Boots', group: 'footwear', subcategories: ['Ankle', 'Chelsea', 'Combat', 'Knee-High'] },
  { id: 'sneakers', name: 'Sneakers', group: 'footwear', subcategories: ['Low-Top', 'High-Top', 'Running'] },
  { id: 'sandals', name: 'Sandals', group: 'footwear', subcategories: ['Flat', 'Slides', 'Heeled'] },
  { id: 'hats', name: 'Hats', group: 'accessories', subcategories: ['Cap', 'Beanie', 'Fedora', 'Bucket'] },
  { id: 'glasses', name: 'Glasses', group: 'accessories', subcategories: ['Sunglasses', 'Optical'] },
  { id: 'scarves', name: 'Scarves', group: 'accessories', subcategories: ['Silk', 'Wool', 'Infinity'] },
  { id: 'bags', name: 'Bags', group: 'accessories', subcategories: ['Handbag', 'Backpack', 'Tote', 'Clutch', 'Crossbody'] },
  { id: 'belts', name: 'Belts', group: 'accessories', subcategories: ['Leather', 'Fabric', 'Chain'] },
  { id: 'jewelry', name: 'Jewelry', group: 'accessories', subcategories: ['Necklace', 'Earrings', 'Bracelet', 'Ring', 'Watch'] },
  { id: 'gloves', name: 'Gloves', group: 'accessories', subcategories: ['Leather', 'Knit'] },
  { id: 'socks', name: 'Socks', group: 'accessories', subcategories: ['Ankle', 'Crew', 'Knee-High'] },
  { id: 'other', name: 'Other', group: 'other', subcategories: [] },
];

export const CATEGORY_GROUPS = [
  { id: 'tops', name: 'Tops' },
  { id: 'bottoms', name: 'Bottoms' },
  { id: 'dresses', name: 'Dresses' },
  { id: 'footwear', name: 'Footwear' },
  { id: 'accessories', name: 'Accessories' },
  { id: 'other', name: 'Other' },
];

export const getCategory = (id) => GARMENT_CATEGORIES.find((c) => c.id === id) || GARMENT_CATEGORIES.find((c) => c.id === 'other');