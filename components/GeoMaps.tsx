"use client";
import { useState } from "react";
import { ComposableMap, Geographies, Geography, Marker } from "react-simple-maps";

// Public natural-earth topojson (110m, ~30KB). Small, cached by react-simple-maps.
// This file exposes each country by its NUMERIC ISO code (e.g. "356" for India) —
// there is no ISO_A3 in the properties, which is why the previous version failed to
// match anything and everything stayed grey.
const WORLD_TOPO = "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";

// ISO 3166-1 alpha-2 -> numeric mapping so we can look up Meta's country codes
// against topojson geographies. Only need the countries GooCampus actually has
// followers in — expand as needed.
const ISO2_TO_NUM: Record<string, string> = {
  IN: "356", PK: "586", GB: "826", NG: "566", AU: "036", AE: "784",
  US: "840", CA: "124", RU: "643", DE: "276", FR: "250", ES: "724",
  IT: "380", GE: "268", BD: "050", LK: "144", NP: "524", PH: "608",
  SG: "702", MY: "458", ZA: "710", SA: "682", QA: "634", OM: "512",
  KW: "414", BH: "048", IE: "372", NZ: "554", CN: "156", JP: "392",
  KR: "410", ID: "360", TH: "764", VN: "704", TR: "792", EG: "818",
  BR: "076", MX: "484", AR: "032", CL: "152", NL: "528", BE: "056",
  SE: "752", NO: "578", DK: "208", FI: "246", PL: "616", GR: "300",
  PT: "620", CH: "756", AT: "040", IR: "364", IQ: "368", AF: "004",
  YE: "887", SY: "760", JO: "400", LB: "422", KE: "404", ET: "231",
  TZ: "834", UG: "800", ZM: "894", ZW: "716", GH: "288", DZ: "012",
  MA: "504", TN: "788", LY: "434", SD: "729", CD: "180", HK: "344",
  TW: "158", MM: "104", KH: "116", LA: "418", MV: "462", BT: "064",
  KZ: "398", UZ: "860", AZ: "031", AM: "051", MT: "470", CY: "196",
  CZ: "203", HU: "348", RO: "642", BG: "100", HR: "191", RS: "688",
  UA: "804", BY: "112", LT: "440", LV: "428", EE: "233", IS: "352",
  SK: "703", SI: "705", BA: "070", AL: "008", MK: "807", MD: "498",
  IL: "376", PS: "275",
};

const COUNTRY_NAME: Record<string, string> = {
  IN: "India", PK: "Pakistan", GB: "United Kingdom", US: "United States",
  AE: "UAE", AU: "Australia", CA: "Canada", NG: "Nigeria", PH: "Philippines",
  GE: "Georgia", RU: "Russia", BD: "Bangladesh", LK: "Sri Lanka", NP: "Nepal",
  SG: "Singapore", MY: "Malaysia", DE: "Germany", FR: "France", ZA: "South Africa",
  SA: "Saudi Arabia", QA: "Qatar", OM: "Oman", KW: "Kuwait", BH: "Bahrain",
  IE: "Ireland", NZ: "New Zealand", IT: "Italy", ES: "Spain",
  IR: "Iran", IQ: "Iraq", AF: "Afghanistan", CN: "China", JP: "Japan",
  KR: "South Korea", ID: "Indonesia", TH: "Thailand", VN: "Vietnam", TR: "Turkey",
  EG: "Egypt", BR: "Brazil", MX: "Mexico", HK: "Hong Kong",
};

// Hardcoded lat/lng for the cities Meta most commonly returns for GooCampus's audience
// (India + neighbouring countries).
const CITY_COORDS: Record<string, [number, number]> = {
  chennai: [80.27, 13.08], bangalore: [77.59, 12.97], bengaluru: [77.59, 12.97],
  delhi: [77.10, 28.61], "new delhi": [77.21, 28.61], mumbai: [72.87, 19.07],
  hyderabad: [78.48, 17.38], kolkata: [88.36, 22.57], ahmedabad: [72.57, 23.02],
  pune: [73.85, 18.52], surat: [72.83, 21.17], jaipur: [75.79, 26.91],
  lucknow: [80.94, 26.85], kanpur: [80.35, 26.45], nagpur: [79.09, 21.15],
  indore: [75.86, 22.72], thane: [72.98, 19.22], bhopal: [77.41, 23.26],
  visakhapatnam: [83.30, 17.69], patna: [85.14, 25.61], vadodara: [73.19, 22.31],
  ghaziabad: [77.44, 28.67], ludhiana: [75.85, 30.90], agra: [78.02, 27.18],
  nashik: [73.79, 19.99], faridabad: [77.31, 28.41], meerut: [77.71, 28.98],
  rajkot: [70.80, 22.30], varanasi: [82.99, 25.32], srinagar: [74.79, 34.08],
  aurangabad: [75.34, 19.88], amritsar: [74.87, 31.63],
  "navi mumbai": [73.01, 19.03], allahabad: [81.85, 25.44], prayagraj: [81.85, 25.44],
  ranchi: [85.33, 23.34], howrah: [88.31, 22.59], coimbatore: [76.96, 11.02],
  jabalpur: [79.98, 23.18], gwalior: [78.18, 26.22], vijayawada: [80.62, 16.51],
  jodhpur: [73.02, 26.24], madurai: [78.12, 9.93], raipur: [81.63, 21.25],
  kota: [75.83, 25.21], chandigarh: [76.78, 30.73], guwahati: [91.74, 26.14],
  solapur: [75.90, 17.66], thiruvananthapuram: [76.94, 8.52],
  trivandrum: [76.94, 8.52], kochi: [76.27, 9.94], cochin: [76.27, 9.94],
  ernakulam: [76.28, 9.98], bhubaneswar: [85.83, 20.30], mangalore: [74.86, 12.91],
  mysore: [76.64, 12.30], gurgaon: [77.03, 28.46], gurugram: [77.03, 28.46],
  noida: [77.39, 28.54],
  // Pakistan
  karachi: [67.01, 24.86], lahore: [74.35, 31.55], islamabad: [73.05, 33.68],
  rawalpindi: [73.05, 33.60], faisalabad: [73.09, 31.42], peshawar: [71.58, 34.02],
  multan: [71.52, 30.19],
  // Bangladesh
  dhaka: [90.41, 23.81], chittagong: [91.83, 22.36],
  // Sri Lanka
  colombo: [79.86, 6.93],
  // Nepal
  kathmandu: [85.32, 27.72],
  // UAE common
  dubai: [55.30, 25.20], "abu dhabi": [54.37, 24.47], sharjah: [55.40, 25.35],
  // Georgia
  tbilisi: [44.79, 41.72],
  // Others
  london: [-0.13, 51.51], manchester: [-2.24, 53.48], "new york": [-74.01, 40.71],
  toronto: [-79.38, 43.65], sydney: [151.21, -33.87], melbourne: [144.96, -37.81],
  singapore: [103.82, 1.35], "kuala lumpur": [101.69, 3.14], doha: [51.53, 25.29],
  riyadh: [46.72, 24.71], jeddah: [39.20, 21.49], muscat: [58.54, 23.61],
};

type HoverInfo = { title: string; sub: string; x: number; y: number } | null;

// Reusable floating tooltip rendered outside the SVG so it stays crisp and can
// escape the map viewport.
function MapTooltip({ hover }: { hover: HoverInfo }) {
  if (!hover) return null;
  return (
    <div
      className="pointer-events-none absolute z-20 bg-white border border-gray-200 rounded-lg shadow-lg px-3 py-2 text-xs whitespace-nowrap"
      style={{ left: hover.x + 14, top: hover.y + 14 }}
    >
      <div className="font-semibold text-gray-900">{hover.title}</div>
      <div className="text-gray-600 mt-0.5">{hover.sub}</div>
    </div>
  );
}

// World map — highlights each country present in `entries`. Non-highlighted countries
// are neutral grey; highlighted countries scale violet from light -> deep by share.
// This gives real visual contrast so India (73%) reads distinctly darker than the UK (4%).
export function CountriesWorldMap({ entries }: { entries: { label: string; value: number }[] }) {
  const [hover, setHover] = useState<HoverInfo>(null);
  const total = entries.reduce((s, e) => s + e.value, 0);
  // Build a numeric-ID -> { name, pct, value } lookup ONCE per render so the hover
  // handler doesn't have to rely on closures captured inside a large .map() body
  // (that's the stale-state trap we just hit).
  const byNum = new Map<string, { name: string; value: number; share: number }>();
  for (const e of entries) {
    const num = ISO2_TO_NUM[e.label];
    if (num) {
      byNum.set(num, {
        name: COUNTRY_NAME[e.label] || e.label,
        value: e.value,
        share: (e.value / total) * 100,
      });
    }
  }
  const max = Math.max(...entries.map((e) => e.value), 1);

  function fillForValue(v: number): string {
    if (v === 0) return "#f1f5f9";
    const ratio = v / max;
    if (ratio > 0.75) return "#5b21b6";
    if (ratio > 0.40) return "#7c3aed";
    if (ratio > 0.20) return "#a78bfa";
    if (ratio > 0.08) return "#c4b5fd";
    return "#ddd6fe";
  }

  // Single mouse handler at the wrapper level. Uses event.target's data attributes
  // to figure out which country is being hovered — no per-Geography closures.
  function onMouseMoveWrap(e: React.MouseEvent<HTMLDivElement>) {
    const target = e.target as SVGElement | null;
    const geoId = target?.getAttribute("data-geo-num");
    const wrap = e.currentTarget.getBoundingClientRect();
    if (!geoId) { setHover(null); return; }
    const info = byNum.get(geoId);
    if (!info) { setHover(null); return; }
    setHover({
      title: info.name,
      sub: `${info.share.toFixed(1)}% · ${info.value.toLocaleString("en-IN")} followers`,
      x: e.clientX - wrap.left,
      y: e.clientY - wrap.top,
    });
  }

  return (
    <div className="geo-map-wrap relative w-full h-full" onMouseMove={onMouseMoveWrap} onMouseLeave={() => setHover(null)}>
      <ComposableMap
        projection="geoMercator"
        projectionConfig={{ scale: 100, center: [15, 20] }}
        style={{ width: "100%", height: "100%" }}
      >
        <Geographies geography={WORLD_TOPO}>
          {({ geographies }) =>
            geographies.map((geo) => {
              const num = String(geo.id);
              const info = byNum.get(num);
              const value = info?.value || 0;
              const fill = fillForValue(value);
              return (
                <Geography
                  key={geo.rsmKey}
                  geography={geo}
                  fill={fill}
                  stroke={value > 0 ? "#4c1d95" : "#cbd5e1"}
                  strokeWidth={value > 0 ? 0.6 : 0.3}
                  // The data attribute is what the wrapper-level hover handler reads
                  // to identify which country is under the cursor. Set both on the
                  // element itself AND via data-attribute prop for good measure.
                  data-geo-num={num}
                  style={{
                    default: { outline: "none", cursor: value > 0 ? "pointer" : "default" },
                    hover: { outline: "none", fill: value > 0 ? "#4c1d95" : "#e5e7eb" },
                    pressed: { outline: "none" },
                  }}
                />
              );
            })
          }
        </Geographies>
      </ComposableMap>
      <MapTooltip hover={hover} />
    </div>
  );
}

// Cities map — same world topojson zoomed to South Asia, base countries are
// neutral so the cyan follower dots pop. Each dot is fully interactive.
export function CitiesRegionMap({ entries }: { entries: { label: string; value: number }[] }) {
  const [hover, setHover] = useState<HoverInfo>(null);
  const total = entries.reduce((s, e) => s + e.value, 0);
  const parsed = entries
    .map((e, idx) => {
      const nameKey = e.label.split(",")[0].trim().toLowerCase();
      const coords = CITY_COORDS[nameKey];
      if (!coords) return null;
      return { id: `city-${idx}`, full: e.label, value: e.value, coords, share: (e.value / total) * 100 };
    })
    .filter((x): x is { id: string; full: string; value: number; coords: [number, number]; share: number } => x !== null);

  const maxVal = Math.max(...parsed.map((p) => p.value), 1);
  // Same data-attribute pattern as the countries map — hover handler reads the
  // circle's data-city-id and looks the row up in this Map, no closure baggage.
  const cityIndex = new Map(parsed.map((p) => [p.id, p]));

  function onMouseMoveWrap(e: React.MouseEvent<HTMLDivElement>) {
    const target = e.target as SVGElement | null;
    const id = target?.getAttribute("data-city-id");
    const wrap = e.currentTarget.getBoundingClientRect();
    if (!id) { setHover(null); return; }
    const info = cityIndex.get(id);
    if (!info) { setHover(null); return; }
    setHover({
      title: info.full,
      sub: `${info.share.toFixed(1)}% · ${info.value.toLocaleString("en-IN")} followers`,
      x: e.clientX - wrap.left,
      y: e.clientY - wrap.top,
    });
  }

  return (
    <div className="geo-map-wrap relative w-full h-full" onMouseMove={onMouseMoveWrap} onMouseLeave={() => setHover(null)}>
      <ComposableMap
        projection="geoMercator"
        projectionConfig={{ scale: 500, center: [80, 22] }}
        style={{ width: "100%", height: "100%" }}
      >
        <Geographies geography={WORLD_TOPO}>
          {({ geographies }) =>
            geographies.map((geo) => (
              <Geography
                key={geo.rsmKey}
                geography={geo}
                fill="#f1f5f9"
                stroke="#cbd5e1"
                strokeWidth={0.4}
                style={{
                  default: { outline: "none" },
                  hover: { outline: "none", fill: "#e2e8f0" },
                  pressed: { outline: "none" },
                }}
              />
            ))
          }
        </Geographies>
        {parsed.map((p) => {
          const r = 4 + (p.value / maxVal) * 12;
          return (
            <Marker key={p.id} coordinates={p.coords}>
              <circle
                r={r}
                fill="rgba(6, 182, 212, 0.55)"
                stroke="#0e7490"
                strokeWidth={1.5}
                data-city-id={p.id}
                style={{ cursor: "pointer" }}
              />
            </Marker>
          );
        })}
      </ComposableMap>
      <MapTooltip hover={hover} />
    </div>
  );
}
