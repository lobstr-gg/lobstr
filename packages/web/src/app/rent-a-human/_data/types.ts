export type TaskCategory =
  | "Errands & Delivery"
  | "Document & Legal"
  | "Field Research"
  | "Photography & Video"
  | "Hardware & Setup"
  | "Meetings & Events"
  | "Testing & QA"
  | "Other Physical";

export const TASK_CATEGORIES: { label: TaskCategory; icon: string }[] = [
  { label: "Errands & Delivery", icon: "📦" },
  { label: "Document & Legal", icon: "📄" },
  { label: "Field Research", icon: "🔍" },
  { label: "Photography & Video", icon: "📸" },
  { label: "Hardware & Setup", icon: "🔧" },
  { label: "Meetings & Events", icon: "🤝" },
  { label: "Testing & QA", icon: "🧪" },
  { label: "Other Physical", icon: "🌍" },
];

export type Continent =
  | "North America"
  | "Europe"
  | "Asia"
  | "South America"
  | "Africa"
  | "Oceania";

export interface LocationInfo {
  city: string;
  region: string;
  country: string;
  countryCode: string; // ISO 3166-1 alpha-2
  continent: Continent;
}

export const LOCATION_REGIONS = [
  { label: "All Regions", code: "all" },
  { label: "North America", code: "NA" },
  { label: "Europe", code: "EU" },
  { label: "Asia", code: "AS" },
  { label: "South America", code: "SA" },
  { label: "Africa", code: "AF" },
  { label: "Oceania", code: "OC" },
] as const;

export type RegionCode = (typeof LOCATION_REGIONS)[number]["code"];

const CONTINENT_TO_REGION: Record<Continent, RegionCode> = {
  "North America": "NA",
  Europe: "EU",
  Asia: "AS",
  "South America": "SA",
  Africa: "AF",
  Oceania: "OC",
};

export function continentToRegion(continent: Continent): RegionCode {
  return CONTINENT_TO_REGION[continent];
}

export interface HumanProvider {
  id: string;
  name: string;
  address: string;
  avatar: string;
  profileImageUrl?: string;
  bio: string;
  skills: string[];
  categories: TaskCategory[];
  location: string;
  locationInfo: LocationInfo;
  timezone: string;
  hourlyRate: number;
  flatRates: Record<string, number>;
  availability: "available" | "busy" | "offline";
  responseTime: string;
  completions: number;
  rating: number;
  reputationScore: number;
  reputationTier: "Bronze" | "Silver" | "Gold" | "Platinum";
  verified: boolean;
  joinedAt: number;
}

export interface TaskPost {
  title: string;
  description: string;
  category: TaskCategory;
  budget: number;
  location: string;
  deadline: string;
}

export interface HumanBooking {
  id: string;
  humanId: string;
  taskTitle: string;
  taskDescription: string;
  budget: number;
  requesterAddress: string;
  status: "pending" | "accepted" | "completed" | "cancelled";
  createdAt: number;
}
