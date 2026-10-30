// Every outside service Marketing OS holds a key for, and what it's used for (System →
// API keys, 30 Oct). Names only — never values. `env` are the settings that hold the key;
// `db` are mh_integration_tokens providers (a prefix ends in ":") for keys connected from
// inside the dashboard. A service counts as set up when any of them is present.
// When a new integration is added, add its line here.

export type ApiKeyEntry = { group: string; service: string; env: string[]; db?: string[]; use: string; unused?: boolean };

export const API_KEYS: ApiKeyEntry[] = [
  // Your own social accounts
  { group: "Social accounts", service: "Meta (Instagram + Facebook)", env: ["META_APP_ID", "META_APP_SECRET", "META_LONG_LIVED_USER_TOKEN", "IG_PAGE_ACCESS_TOKEN", "ACCOUNTS_JSON"], db: ["meta", "meta:page:"],
    use: "Instagram and Facebook insights, posts, comments and DMs for every brand; publishing from the Scheduler; the Meta key expiry warning. Brands connected on the Brands page keep their page key in the database." },
  { group: "Social accounts", service: "Meta Ads", env: ["META_AD_ACCOUNT_ID"], use: "The Ads and Campaigns tabs — spend, reach and results from the ad account." },
  { group: "Social accounts", service: "YouTube (channel access)", env: ["YOUTUBE_CLIENT_ID", "YOUTUBE_CLIENT_SECRET", "YOUTUBE_REFRESH_TOKENS", "YOUTUBE_CHANNEL_IDS"], db: ["youtube:"],
    use: "Each channel's analytics — views, watch time, subscribers, audience, videos. One lasting permission per channel; Samvaya's is in the database." },
  { group: "Social accounts", service: "YouTube (public data)", env: ["YOUTUBE_API_KEY"], use: "Public channel and video numbers for competitor benchmarks and Competitor Watch." },
  { group: "Social accounts", service: "LinkedIn", env: ["LINKEDIN_CLIENT_ID", "LINKEDIN_CLIENT_SECRET", "LINKEDIN_ACCESS_TOKEN", "LINKEDIN_REFRESH_TOKEN"], db: ["linkedin", "linkedin_refresh"],
    use: "Company-page followers, posts and stats; posting from the LinkedIn scheduler. The key renews itself." },

  // Website
  { group: "Website", service: "Google Analytics", env: ["GA4_CLIENT_EMAIL", "GA4_PRIVATE_KEY", "GA4_PROPERTY_ID"], use: "The Website tab — visitors, sources, pages, and where visitors are (read-only)." },
  { group: "Website", service: "Microsoft Clarity", env: ["CLARITY_API_TOKEN", "CLARITY_PROJECT_ID"], use: "Website behaviour — rage clicks, dead clicks, scroll depth (last 1–3 days)." },
  { group: "Website", service: "Bing Webmaster", env: ["BING_WEBMASTER_API_KEY", "BING_SITE_URL"], use: "Bing search clicks and impressions for the website." },
  { group: "Website", service: "DataForSEO", env: ["DATAFORSEO_LOGIN", "DATAFORSEO_PASSWORD"], use: "The GEO SEO tab — how the brands show up in AI and search answers." },

  // AI
  { group: "AI", service: "Perplexity", env: ["PERPLEXITY_API_KEY", "PLANNER_SEARCH_KEY"], use: "The only AI in the dashboard: AI insights, the Post Planner, content suggestions, PDF summaries. Monthly spend capped by AI_MONTHLY_BUDGET_USD." },
  { group: "AI", service: "OpenAI", env: ["OPENAI_API_KEY"], use: "Not used anywhere — the key is set but no feature calls it. Safe to remove.", unused: true },

  // Research
  { group: "Research & competitors", service: "Apify", env: ["APIFY_API_TOKEN"], use: "Instagram hashtag and competitor scraping (first choice)." },
  { group: "Research & competitors", service: "HikerAPI", env: ["HIKERAPI_KEY"], use: "Backup for Instagram scraping when Apify fails." },
  { group: "Research & competitors", service: "Serper (Google search)", env: ["SERPER_API_KEY"], use: "Brand mentions and competitor profiles from Google results. Monthly budget capped by SERPER_MONTHLY_BUDGET." },
  { group: "Research & competitors", service: "Reddit", env: ["REDDIT_CLIENT_ID", "REDDIT_CLIENT_SECRET"], use: "Public Reddit threads for Content Radar." },
  { group: "Research & competitors", service: "Brave Search", env: ["BRAVE_SEARCH_KEY"], use: "Forum and review-site mentions (Quora, MouthShut…) for Content Radar — optional, used only if set." },

  // Leads, sales and messages
  { group: "Leads, sales & messages", service: "Airtable", env: ["AIRTABLE_API_KEY"], use: "The CRM leads behind Marketing Leads, Sales Hub and Campaigns." },
  { group: "Leads, sales & messages", service: "Razorpay", env: ["RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET", "RAZORPAY_EBOOK_WEBHOOK_SECRET"], use: "e-Book Orders — every e-Book payment; the webhook secret checks incoming payment alerts." },
  { group: "Leads, sales & messages", service: "SendPulse", env: ["SENDPULSE_CLIENT_ID", "SENDPULSE_CLIENT_SECRET"], use: "Instagram DM bridging (the DM inbox and DM leads)." },
  { group: "Leads, sales & messages", service: "WhatsApp (WAHA via n8n)", env: ["CRON_SECRET", "WAHA_READ_WEBHOOK", "WAHA_SESSION_WEBHOOK"], use: "Community Broadcast — sending WhatsApp messages and linking the number. Goes through n8n, protected by CRON_SECRET; the two WAHA addresses are built in and only need setting to point elsewhere." },

  // Notifications
  { group: "Email & notifications", service: "Gmail", env: ["GMAIL_USER", "GMAIL_APP_PASSWORD"], db: ["gmail", "gmail:"], use: "Sending emails (approvals, digests) and reading the info@ / praveen@ inboxes." },
  { group: "Email & notifications", service: "Slack", env: ["SLACK_WEBHOOK_URL"], use: "Posts approvals, publish news and updates to the team's Slack channel." },
  { group: "Email & notifications", service: "Telegram", env: ["DAY_REPORT_TELEGRAM_CHAT"], db: ["telegram"], use: "The daily report and Watchers alerts on Telegram." },

  // The dashboard itself
  { group: "Dashboard itself", service: "Supabase (database)", env: ["SUPABASE_URL", "SUPABASE_SECRET_KEY", "SUPABASE_PUBLISHABLE_KEY"], use: "The database everything in Marketing OS is stored in." },
  { group: "Dashboard itself", service: "Google sign-in", env: ["GOOGLE_LOGIN_CLIENT_ID", "GOOGLE_LOGIN_CLIENT_SECRET"], use: "The “Sign in with Google” button on the login page." },
  { group: "Dashboard itself", service: "n8n", env: ["N8N_API_KEY"], use: "Reads the automations (the publisher, imports) for the Workflows tab." },
  { group: "Dashboard itself", service: "Netlify", env: ["NETLIFY_AUTH_TOKEN"], use: "Hosting usage on the Integrations tab, and deploys." },
  { group: "Dashboard itself", service: "Internal secrets", env: ["SESSION_SECRET", "CRON_SECRET", "DASHBOARD_PASSWORD"], use: "Not outside services — they sign logins, protect scheduled jobs and the backup password." },
];
