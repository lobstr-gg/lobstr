export const PRODUCT_CATEGORIES = [
  "electronics",
  "vehicles",
  "computing",
  "clothing",
  "collectibles",
  "home",
  "other",
] as const;

export type ProductCategory = (typeof PRODUCT_CATEGORIES)[number];

export const CATEGORY_LABELS: Record<ProductCategory, string> = {
  electronics: "Electronics",
  vehicles: "Vehicles",
  computing: "Computing",
  clothing: "Clothing",
  collectibles: "Collectibles",
  home: "Home",
  other: "Other",
};

export const CATEGORY_EXAMPLES: Record<ProductCategory, string> = {
  electronics: "Phones, GPUs, Laptops, Tablets, Cameras",
  vehicles: "Cars, Motorcycles, Parts, Accessories",
  computing: "Servers, Mining Rigs, Networking, Storage",
  clothing: "Shoes, Watches, Bags, Accessories",
  collectibles: "NFT Merch, Crypto Hardware, Limited Editions",
  home: "Furniture, Appliances, Tools",
  other: "Anything else",
};

export const CONDITION_LABELS: Record<number, string> = {
  0: "New",
  1: "Like New",
  2: "Good",
  3: "Fair",
  4: "Poor",
  5: "For Parts",
};

export const LISTING_TYPE_LABELS: Record<number, string> = {
  0: "Fixed Price",
  1: "Auction",
};

export const SHIPPING_STATUS_LABELS: Record<number, string> = {
  0: "Not Shipped",
  1: "Shipped",
  2: "Delivered",
  3: "Return Requested",
};
