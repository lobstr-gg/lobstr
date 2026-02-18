export type ProviderType = "agent" | "human";

export type TransactionType =
  | "agent-to-agent"
  | "human-to-agent"
  | "agent-to-human";

export type ReputationTier =
  | "Bronze"
  | "Silver"
  | "Gold"
  | "Platinum";

export type StakeTier =
  | "None"
  | "Bronze"
  | "Silver"
  | "Gold"
  | "Platinum";

export type ServiceCategory =
  | "Data Scraping"
  | "Translation"
  | "Writing"
  | "Coding"
  | "Research"
  | "Design"
  | "Marketing"
  | "Legal"
  | "Finance"
  | "Physical Task"
  | "Other";

export type SortMode =
  | "newest"
  | "price-asc"
  | "price-desc"
  | "reputation"
  | "completions";

export type ViewMode = "grid" | "table";

export interface ProviderInfo {
  address: string;
  name: string;
  providerType: ProviderType;
  reputationScore: number;
  reputationTier: ReputationTier;
  completions: number;
  stakeTier: StakeTier;
  responseTime: string;     // e.g. "< 1 min", "2-4 hrs"
  responseTimeMinutes: number; // for filtering
  completionRate: number;   // 0-100 percentage
}

export interface MockListing {
  id: string;
  title: string;
  description: string;
  category: ServiceCategory;
  price: number;            // in LOB
  settlementToken: "LOB" | "USDC";
  estimatedDeliveryHours: number;
  provider: ProviderInfo;
  transactionType: TransactionType;
  tags: string[];
  createdAt: number;        // timestamp
  active: boolean;
}

export interface MarketplaceFilters {
  search: string;
  providerType: ProviderType | "all";
  transactionType: TransactionType | "all";
  category: ServiceCategory | "All";
  sortMode: SortMode;
  viewMode: ViewMode;
  // Advanced filters
  priceMin: number | null;
  priceMax: number | null;
  reputationTier: ReputationTier | "All";
  stakeTier: StakeTier | "All";
  maxResponseTimeMinutes: number | null;
  minCompletionRate: number | null;
}

export const DEFAULT_FILTERS: MarketplaceFilters = {
  search: "",
  providerType: "all",
  transactionType: "all",
  category: "All",
  sortMode: "newest",
  viewMode: "grid",
  priceMin: null,
  priceMax: null,
  reputationTier: "All",
  stakeTier: "All",
  maxResponseTimeMinutes: null,
  minCompletionRate: null,
};

export type FilterAction =
  | { type: "SET_SEARCH"; payload: string }
  | { type: "SET_PROVIDER_TYPE"; payload: ProviderType | "all" }
  | { type: "SET_TRANSACTION_TYPE"; payload: TransactionType | "all" }
  | { type: "SET_CATEGORY"; payload: ServiceCategory | "All" }
  | { type: "SET_SORT"; payload: SortMode }
  | { type: "SET_VIEW"; payload: ViewMode }
  | { type: "SET_PRICE_MIN"; payload: number | null }
  | { type: "SET_PRICE_MAX"; payload: number | null }
  | { type: "SET_REPUTATION_TIER"; payload: ReputationTier | "All" }
  | { type: "SET_STAKE_TIER"; payload: StakeTier | "All" }
  | { type: "SET_MAX_RESPONSE_TIME"; payload: number | null }
  | { type: "SET_MIN_COMPLETION_RATE"; payload: number | null }
  | { type: "CLEAR_ALL" }
  | { type: "REMOVE_FILTER"; payload: keyof MarketplaceFilters };

export function filterReducer(
  state: MarketplaceFilters,
  action: FilterAction
): MarketplaceFilters {
  switch (action.type) {
    case "SET_SEARCH":
      return { ...state, search: action.payload };
    case "SET_PROVIDER_TYPE":
      return { ...state, providerType: action.payload };
    case "SET_TRANSACTION_TYPE":
      return { ...state, transactionType: action.payload };
    case "SET_CATEGORY":
      return { ...state, category: action.payload };
    case "SET_SORT":
      return { ...state, sortMode: action.payload };
    case "SET_VIEW":
      return { ...state, viewMode: action.payload };
    case "SET_PRICE_MIN":
      return { ...state, priceMin: action.payload };
    case "SET_PRICE_MAX":
      return { ...state, priceMax: action.payload };
    case "SET_REPUTATION_TIER":
      return { ...state, reputationTier: action.payload };
    case "SET_STAKE_TIER":
      return { ...state, stakeTier: action.payload };
    case "SET_MAX_RESPONSE_TIME":
      return { ...state, maxResponseTimeMinutes: action.payload };
    case "SET_MIN_COMPLETION_RATE":
      return { ...state, minCompletionRate: action.payload };
    case "CLEAR_ALL":
      return { ...DEFAULT_FILTERS, viewMode: state.viewMode };
    case "REMOVE_FILTER": {
      const key = action.payload;
      const defaults = DEFAULT_FILTERS;
      return { ...state, [key]: defaults[key] };
    }
    default:
      return state;
  }
}

export const CATEGORIES: (ServiceCategory | "All")[] = [
  "All",
  "Data Scraping",
  "Translation",
  "Writing",
  "Coding",
  "Research",
  "Design",
  "Marketing",
  "Legal",
  "Finance",
  "Physical Task",
  "Other",
];

export const REPUTATION_TIERS: (ReputationTier | "All")[] = [
  "All",
  "Bronze",
  "Silver",
  "Gold",
  "Platinum",
];

export const STAKE_TIERS: (StakeTier | "All")[] = [
  "All",
  "None",
  "Bronze",
  "Silver",
  "Gold",
  "Platinum",
];

/** Maps on-chain category enum (uint8) to display string */
export const SERVICE_CATEGORY_MAP: Record<number, ServiceCategory> = {
  0: "Data Scraping",
  1: "Translation",
  2: "Writing",
  3: "Coding",
  4: "Research",
  5: "Design",
  6: "Marketing",
  7: "Legal",
  8: "Finance",
  9: "Physical Task",
  10: "Other",
};

/** Maps display string back to on-chain category enum (uint8) */
export const SERVICE_CATEGORY_REVERSE: Record<ServiceCategory, number> = Object.fromEntries(
  Object.entries(SERVICE_CATEGORY_MAP).map(([k, v]) => [v, Number(k)])
) as Record<ServiceCategory, number>;
