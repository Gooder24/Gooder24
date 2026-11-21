// Renders card.svg: the stack (TypeScript, Rust, PostgreSQL) and two facts from the contribution
// calendar, the best single day and the longest streak, in the KarchiOS palette and font. Run with `bun scripts/card.ts`; needs
// GH_TOKEN (the Actions GITHUB_TOKEN is enough) and reads the same calendar as the profile page,
// so private work shows up here only when "Private contributions" is on in the profile settings.
import { readFileSync, writeFileSync } from "node:fs";

const LOGIN = "Gooder24";
const token = process.env.GH_TOKEN ?? process.env.GITHUB_TOKEN;
if (!token) throw new Error("GH_TOKEN is not set");

const C = {
  surface: "#000a07",
  container: "#0a1512",
  high: "#1a2320",
  outline: "#585f5d",
  text: "#f0f0eb",
  variant: "#b4b4b0",
  warning: "#e2c08d",
};

interface Day {
  date: string;
  contributionCount: number;
}

async function graphql<T>(query: string): Promise<T> {
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: { Authorization: `bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  const body = (await res.json()) as { data?: T; errors?: unknown };
  if (!res.ok || !body.data) throw new Error(`GitHub: ${res.status} ${JSON.stringify(body.errors)}`);
  return body.data;
}

const { user } = await graphql<{ user: { createdAt: string } }>(
  `{ user(login: "${LOGIN}") { createdAt } }`,
);
const today = new Date().toISOString().slice(0, 10);
const days: Day[] = [];
for (let year = Number(user.createdAt.slice(0, 4)); year <= Number(today.slice(0, 4)); year++) {
  const data = await graphql<{
    user: { contributionsCollection: { contributionCalendar: { weeks: { contributionDays: Day[] }[] } } };
  }>(`{ user(login: "${LOGIN}") { contributionsCollection(from: "${year}-01-01T00:00:00Z", to: "${year}-12-31T23:59:59Z") {
        contributionCalendar { weeks { contributionDays { date contributionCount } } } } } }`);
  for (const week of data.user.contributionsCollection.contributionCalendar.weeks) {
    days.push(...week.contributionDays.filter((d) => d.date <= today));
  }
}

const best = days.reduce((a, b) => (b.contributionCount > a.contributionCount ? b : a));
let longest = 0;
let run = 0;
for (const d of days) {
  run = d.contributionCount > 0 ? run + 1 : 0;
  longest = Math.max(longest, run);
}

const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const fmt = (iso: string) => `${Number(iso.slice(8, 10))} ${months[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;

const asset = (name: string) => new URL(`../assets/${name}`, import.meta.url);
const font = readFileSync(asset("DepartureMono-Regular.woff2")).toString("base64");
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
const text = (x: number, y: number, size: number, fill: string, s: string) =>
  `<text x="${x}" y="${y}" font-size="${size}" fill="${fill}">${esc(s)}</text>`;
const panel = (x: number, w: number) =>
  `<rect x="${x + 1}" y="17" width="${w - 2}" height="86" fill="${C.container}" stroke="${C.outline}" stroke-width="2"/>`;

const W = 840;
const H = 120;
const stackW = 344;
const factW = (W - 32 - stackW - 16) / 2;

// Every logo sits in the same 36 px tile as a 24 px glyph, so the three read as one set. Rust and
// PostgreSQL are Simple Icons paths (CC0) on a 24-unit grid; the TypeScript mark is its letters, set
// in the card's own font, because its Simple Icons path is itself a filled square.
const tile = (x: number, glyph: string) =>
  `<rect x="${x + 1}" y="45" width="34" height="34" fill="${C.high}" stroke="${C.outline}" stroke-width="2"/>
${glyph}`;
const logo = (icon: string) => (x: number) =>
  `<path transform="translate(${x + 6} 50)" fill="${C.text}" d="${readFileSync(asset(`icons/${icon}.path`), "utf8").trim()}"/>`;
const stack = [
  { name: "TypeScript", glyph: (x: number) => `<text x="${x + 18}" y="70" font-size="22" fill="${C.text}" text-anchor="middle">TS</text>` },
  { name: "Rust", glyph: logo("rust") },
  { name: "PostgreSQL", glyph: logo("postgresql") },
]
  .map((s, i) => {
    const x = 28 + i * 108;
    return `${tile(x, s.glyph(x))}
${text(x, 96, 11, C.variant, s.name)}`;
  })
  .join("\n");

const facts = [
  { label: "BEST DAY", value: String(best.contributionCount), note: `contributions · ${fmt(best.date)}` },
  { label: "LONGEST STREAK", value: `${longest} days`, note: "in a row" },
]
  .map((f, i) => {
    const x = 16 + stackW + 8 + i * (factW + 8);
    return `${panel(x, factW)}
${text(x + 12, 38, 11, C.variant, f.label)}
${text(x + 12, 74, 33, i === 0 ? C.warning : C.text, f.value)}
${text(x + 12, 92, 11, C.variant, f.note)}`;
  })
  .join("\n");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-labelledby="t">
<title id="t">${esc(`Stack: TypeScript, Rust, PostgreSQL. Best day: ${best.contributionCount} contributions on ${fmt(best.date)}. Longest streak: ${longest} days.`)}</title>
<style>@font-face{font-family:"Departure Mono";src:url(data:font/woff2;base64,${font}) format("woff2")}text{font-family:"Departure Mono",monospace}</style>
<rect x="1" y="1" width="${W - 2}" height="${H - 2}" rx="12" fill="${C.surface}" stroke="${C.outline}" stroke-width="2"/>
${panel(16, stackW)}
${text(28, 38, 11, C.variant, "STACK")}
${stack}
${facts}
</svg>
`;
writeFileSync(new URL("../card.svg", import.meta.url), svg);
console.log(`card.svg: best ${best.contributionCount} on ${best.date}, longest streak ${longest}`);
