// Renders card.svg: streak, longest streak, best single day and total contributions, plus the last
// year as a pixel grid, in the KarchiOS palette and font. Run with `bun scripts/card.ts`; needs
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
  primary: "#628790",
  secondary: "#a2cdc4",
  warning: "#e2c08d",
};

type Level = "NONE" | "FIRST_QUARTILE" | "SECOND_QUARTILE" | "THIRD_QUARTILE" | "FOURTH_QUARTILE";
interface Day {
  date: string;
  contributionCount: number;
  contributionLevel: Level;
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
        contributionCalendar { weeks { contributionDays { date contributionCount contributionLevel } } } } } }`);
  for (const week of data.user.contributionsCollection.contributionCalendar.weeks) {
    days.push(...week.contributionDays.filter((d) => d.date <= today));
  }
}

const total = days.reduce((sum, d) => sum + d.contributionCount, 0);
const best = days.reduce((a, b) => (b.contributionCount > a.contributionCount ? b : a));
const first = days.find((d) => d.contributionCount > 0)?.date ?? today;

let longest = 0;
let run = 0;
for (const d of days) {
  run = d.contributionCount > 0 ? run + 1 : 0;
  longest = Math.max(longest, run);
}
// Today without a contribution yet does not break the streak; the day is not over.
let current = 0;
for (let i = days.length - 1; i >= 0; i--) {
  if (days[i].contributionCount > 0) current++;
  else if (days[i].date !== today) break;
}

const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const fmt = (iso: string) => `${Number(iso.slice(8, 10))} ${months[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

const font = readFileSync(new URL("../assets/DepartureMono-Regular.woff2", import.meta.url)).toString("base64");
const W = 840;
const H = 280;
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
const text = (x: number, y: number, size: number, fill: string, s: string, anchor = "start") =>
  `<text x="${x}" y="${y}" font-size="${size}" fill="${fill}" text-anchor="${anchor}">${esc(s)}</text>`;

const stats = [
  { label: "CURRENT STREAK", value: plural(current, "day"), note: current > 0 ? "still going" : "starts again today" },
  { label: "LONGEST STREAK", value: plural(longest, "day"), note: "all time" },
  { label: "BEST DAY", value: String(best.contributionCount), note: fmt(best.date) },
  { label: "TOTAL", value: String(total), note: `since ${fmt(first).slice(-8)}` },
];
const cellW = (W - 32 - 3 * 8) / 4;
const cells = stats
  .map((s, i) => {
    const x = 16 + i * (cellW + 8);
    return `<rect x="${x + 1}" y="49" width="${cellW - 2}" height="86" fill="${C.container}" stroke="${C.outline}" stroke-width="2"/>
${text(x + 12, 70, 11, C.variant, s.label)}
${text(x + 12, 106, 33, i === 2 ? C.warning : C.text, s.value)}
${text(x + 12, 124, 11, C.variant, s.note)}`;
  })
  .join("\n");

// Last 53 weeks, a column per week starting on Sunday, like the profile graph.
const fill: Record<Level, { c: string; o: number }> = {
  NONE: { c: C.high, o: 1 },
  FIRST_QUARTILE: { c: C.primary, o: 0.45 },
  SECOND_QUARTILE: { c: C.primary, o: 0.75 },
  THIRD_QUARTILE: { c: C.primary, o: 1 },
  FOURTH_QUARTILE: { c: C.secondary, o: 1 },
};
const recent = days.slice(-371);
const pad = new Date(`${recent[0].date}T00:00:00Z`).getUTCDay();
const grid = recent
  .map((d, i) => {
    const slot = i + pad;
    const x = 16 + Math.floor(slot / 7) * 15;
    const y = 160 + (slot % 7) * 15;
    const f = fill[d.contributionLevel];
    const mark = d.date === best.date ? ` stroke="${C.warning}" stroke-width="2"` : "";
    return `<rect x="${x}" y="${y}" width="12" height="12" fill="${f.c}" fill-opacity="${f.o}"${mark}><title>${d.contributionCount} on ${fmt(d.date)}</title></rect>`;
  })
  .join("");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-labelledby="t">
<title id="t">${esc(`${LOGIN}: current streak ${plural(current, "day")}, longest ${plural(longest, "day")}, best day ${best.contributionCount} contributions on ${fmt(best.date)}, ${total} contributions since ${fmt(first)}`)}</title>
<style>@font-face{font-family:"Departure Mono";src:url(data:font/woff2;base64,${font}) format("woff2")}text{font-family:"Departure Mono",monospace}</style>
<rect x="1" y="1" width="${W - 2}" height="${H - 2}" rx="12" fill="${C.surface}" stroke="${C.outline}" stroke-width="2"/>
${text(16, 30, 11, C.text, `${LOGIN.toLowerCase()} ~ contributions`)}
${text(W - 16, 30, 11, C.variant, `updated ${fmt(today)}`, "end")}
${cells}
${grid}
</svg>
`;
writeFileSync(new URL("../card.svg", import.meta.url), svg);
console.log(`card.svg: streak ${current}, longest ${longest}, best ${best.contributionCount} on ${best.date}, total ${total}`);
