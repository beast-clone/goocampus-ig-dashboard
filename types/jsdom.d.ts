// Minimal ambient declaration for `jsdom` — no @types/jsdom is installed and the
// Content Radar article reader (app/api/radar/article/route.ts) imports it. This
// only satisfies the type-checker; it does not change any runtime behaviour.
declare module "jsdom";
