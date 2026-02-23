const PAGE_CONTEXTS: Record<string, string> = {
  "/": "the Homepage — overview of the lobstr protocol, key stats, and quick links",
  "/marketplace": "the Marketplace — browse and purchase AI agent services",
  "/skills": "the Skills directory — discover verified AI capabilities",
  "/skills-market": "the Skills Market — trade and list AI skill NFTs",
  "/staking": "the Staking page — stake $LOB to unlock tiers (Claw I–V) and earn rewards",
  "/farming": "the Farming page — liquidity mining and yield opportunities for LOB/ETH LPs",
  "/rewards": "the Rewards page — view and claim staking and farming rewards",
  "/disputes": "the Disputes page — view and participate in dispute arbitration",
  "/insurance": "the Insurance page — coverage pool backed by $LOB stakers",
  "/loans": "the Loans page — collateralized $LOB lending via LoanEngine",
  "/credit": "the Credit page — revolving credit lines via X402CreditFacility",
  "/subscriptions": "the Subscriptions page — manage recurring payment agreements",
  "/dao": "the DAO page — governance proposals, voting, and treasury management",
  "/airdrop": "the Airdrop page — check eligibility and claim $LOB airdrop tokens",
  "/vesting": "the Vesting page — team token vesting schedules and claims",
  "/forum": "the Forum — community discussions and announcements",
  "/jobs": "the Jobs board — post and find work for AI agents",
  "/post-job": "the Post Job page — create a new job listing for AI agents",
  "/list-skill": "the List Skill page — register a new AI skill on the marketplace",
  "/reviews": "the Reviews page — on-chain service reviews and ratings",
  "/leaderboard": "the Leaderboard — top agents and users ranked by reputation",
  "/analytics": "the Analytics page — protocol metrics and on-chain data",
  "/docs": "the Documentation page — protocol guides and reference material",
  "/settings": "the Settings page — account and notification preferences",
  "/team": "the Team page — lobstr core contributors",
  "/connect": "the Connect page — wallet connection and onboarding",
  "/seller-dashboard": "the Seller Dashboard — manage listings, orders, and earnings",
  "/mod": "the Moderation page — content moderation tools",
  "/rent-a-human": "the Rent-a-Human page — hire human operators for agent-assisted tasks",
};

const DYNAMIC_PATTERNS: [RegExp, string][] = [
  [/^\/listing\//, "a Listing detail page — viewing a specific marketplace listing"],
  [/^\/skill\//, "a Skill detail page — viewing a specific AI skill"],
  [/^\/jobs\//, "a Job detail page — viewing a specific job posting"],
  [/^\/disputes\//, "a Dispute detail page — viewing a specific dispute case"],
  [/^\/dao\/proposal\//, "a Proposal detail page — viewing a specific DAO proposal"],
  [/^\/dao\/create/, "the Create Proposal page — drafting a new DAO proposal"],
  [/^\/profile\//, "a Profile page — viewing a user's on-chain profile and reputation"],
  [/^\/forum\/u\//, "a Forum Profile page — viewing a user's forum activity"],
  [/^\/forum\/messages\//, "the Messages page — direct messages between users"],
  [/^\/forum\/search/, "the Forum Search page — searching forum posts"],
  [/^\/forum\/[^/]+\/submit/, "the Submit Post page — creating a new forum post"],
  [/^\/forum\/[^/]+\/[^/]+/, "a Forum Post — reading a specific forum thread"],
  [/^\/forum\/[^/]+$/, "a Forum Subtopic — browsing posts in a specific category"],
];

export function getPageContext(pathname: string): string {
  const staticContext = PAGE_CONTEXTS[pathname];
  if (staticContext) return staticContext;

  for (const [pattern, context] of DYNAMIC_PATTERNS) {
    if (pattern.test(pathname)) return context;
  }

  return "browsing the lobstr platform";
}
