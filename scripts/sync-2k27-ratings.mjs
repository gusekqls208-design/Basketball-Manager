#!/usr/bin/env node
/**
 * Sync current NBA 2K27 ratings into the Basketball Manager roster.
 * Source: NBA 2K API public endpoint (weekly 2K27 ratings data).
 * NBA 2K27 is the sole source of truth. Every visible game attribute is rebuilt from a named 2K27 attribute; game-only fields use a documented nearest 2K attribute. No old game ratings or player-specific overrides are retained.
 */
import fs from "node:fs/promises";

const FILE = "players-2026-27.json";
const BASE = "https://api.nba2kapi.com/api/public/players";
const today = new Date().toISOString().slice(0, 10);

const norm = (s) => String(s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
const asNum = (v) => typeof v === "number" && Number.isFinite(v) ? v : null;
const to20 = (v) => v == null ? null : Math.max(1, Math.min(20, Math.round(v / 5)));
function flatten(obj, out = {}) {
  if (!obj || typeof obj !== "object") return out;
  for (const [k,v] of Object.entries(obj)) {
    if (typeof v === "number" && Number.isFinite(v)) out[norm(k)] = v;
    else if (v && typeof v === "object" && !Array.isArray(v)) flatten(v, out);
  }
  return out;
}
function pick(a, ...keys) {
  for (const k of keys) {
    const v = asNum(a[norm(k)]);
    if (v !== null) return v;
  }
  return null;
}
function setMapped(attrs, target, value) {
  const n = to20(value);
  if (n !== null) attrs[target] = n;
}
function parseHeight(value) {
  const m = String(value ?? "").match(/(\d+)\s*'\s*(\d+)/);
  return m ? Math.round((Number(m[1]) * 12 + Number(m[2])) * 2.54) : null;
}
function parseWeight(value) {
  const m = String(value ?? "").match(/(\d+(?:\.\d+)?)\s*lbs?/i);
  return m ? Math.round(Number(m[1]) * 0.45359237) : null;
}

async function fetchAll() {
  const all = [];
  let cursor = "";
  for (let page = 0; page < 10; page++) {
    const u = new URL(BASE);
    u.searchParams.set("teamType", "curr");
    u.searchParams.set("limit", "100");
    if (cursor) u.searchParams.set("cursor", cursor);
    const res = await fetch(u, { headers: { "Accept": "application/json" } });
    if (!res.ok) throw new Error(`2K27 API returned HTTP ${res.status}: ${await res.text()}`);
    const body = await res.json();
    if (body.success === false || !Array.isArray(body.data)) throw new Error("Unexpected 2K27 API response shape");
    all.push(...body.data);
    const pg = body.meta?.pagination ?? body.pagination ?? {};
    if (!pg.hasMore) break;
    cursor = String(pg.nextCursor ?? (all.length));
    if (!cursor) throw new Error("2K27 API pagination did not return nextCursor");
  }
  const unique = [...new Map(all.map(p => [p.slug || norm(p.name), p])).values()];
  if (unique.length < 400) throw new Error(`Safety stop: only ${unique.length} current 2K27 players fetched`);
  return unique;
}

function applyPlayer(p, source) {
  const a = flatten(source.attributes || source.attrs || {});
  // Rebuild the complete visible attribute set from 2K27 values only.
  // The game has a few fields without a one-to-one 2K label; those use the nearest named 2K rating.
  const next = {};
  const direct = {
    close: ["closeShot", "drivingLayup"],
    layup: ["drivingLayup", "closeShot"],
    dunk: ["drivingDunk", "standingDunk"],
    mid: ["midRangeShot", "threePointShot"],
    three: ["threePointShot", "midRangeShot"],
    ft: ["freeThrow", "midRangeShot"],
    post: ["postControl", "closeShot"],
    handle: ["ballHandle", "speedWithBall"],
    pass: ["passAccuracy", "passIQ"],
    passTech: ["passIQ", "passAccuracy"],
    screen: ["strength", "hustle"],
    perimeter: ["perimeterDefense", "steal"],
    interior: ["interiorDefense", "block"],
    steal: ["steal", "perimeterDefense"],
    block: ["block", "interiorDefense"],
    rebound: ["defensiveRebound", "offensiveRebound"],
    anticipation: ["helpDefenseIQ", "passPerception", "defensiveConsistency"],
    decisions: ["shotIQ", "offensiveConsistency"],
    vision: ["passVision", "vision", "passAccuracy", "passIQ"],
    offBall: ["offensiveConsistency", "shotIQ"],
    positioning: ["defensiveConsistency", "helpDefenseIQ"],
    composure: ["intangibles", "intangible", "shotIQ", "passIQ"],
    concentration: ["shotIQ", "passPerception", "defensiveConsistency"],
    teamwork: ["passIQ", "passAccuracy"],
    workRate: ["hustle", "stamina"],
    leadership: ["intangibles", "intangible", "passIQ", "hustle"],
    determination: ["hustle", "stamina"],
    flair: ["intangibles", "intangible", "offensiveConsistency", "shotIQ", "ballHandle"],
    aggression: ["hustle", "strength"],
    speed: ["speed", "speedWithBall"],
    acceleration: ["speedWithBall", "speed"],
    agility: ["agility", "speed"],
    jumping: ["vertical", "drivingDunk", "standingDunk"],
    strength: ["strength", "interiorDefense"],
    stamina: ["stamina", "hustle"],
    balance: ["agility", "strength"],
  };
  for (const [target, keys] of Object.entries(direct)) {
    const value = pick(a, ...keys);
    if (value === null) throw new Error(`Missing 2K27 source attribute for ${p.name}: ${target} [${keys.join("/") }]`);
    setMapped(next, target, value);
  }
  const required = ["close","layup","dunk","mid","three","ft","post","handle","pass","passTech","screen","perimeter","interior","steal","block","rebound","anticipation","decisions","vision","offBall","positioning","composure","concentration","teamwork","workRate","leadership","determination","flair","aggression","speed","acceleration","agility","jumping","strength","stamina","balance"];
  const missing = required.filter(key => !Number.isInteger(next[key]) || next[key] < 1 || next[key] > 20);
  if (missing.length) throw new Error(`Incomplete 2K27 attribute set for ${p.name}: ${missing.join(", ")}`);

  p.attrs = next;
  if (typeof source.overall === "number") p.ovr = source.overall;
  const positions = Array.isArray(source.positions) ? source.positions : [];
  if (positions.length) {
    p.pos = positions[0];
    p.secondaryPositions = positions.slice(1);
  }
  const height = parseHeight(source.height);
  const weight = parseWeight(source.weight);
  if (height) p.height = height;
  if (weight) p.weight = weight;

  const potential = pick(a, "potential") ?? asNum(source.potential);
  p.hidden = { ...(p.hidden || {}), potential: to20(potential) ?? 10 };

  p.ratingsSource = source.manualSource || "NBA 2K27 current roster (NBA 2K API; sourced from 2KRatings)";
  p.ratingsSourceUrl = source.manualUrl || (source.slug ? "https://nba2kapi.com/players/" + source.slug : "https://nba2kapi.com");
  p.ratingsSourcePlayer = source.name || p.name;
  p.ratingsSourceTeam = source.team || null;
  p.ratingsSourcePositions = Array.isArray(source.positions) ? source.positions : [];
  p.ratingsScale = "All 36 visible attributes rebuilt from NBA 2K27 source attributes (0-100 to 1-20 by round(value/5)); OVR copied directly";
  delete p.blockRatingNote;
  p.ratingsUpdatedAt = today;
  p.ratingsStatus = "2K-direct-27";
  p.attributeMapping = "All visible attributes rebuilt from 2K27; Screen=Strength, Acceleration=Speed With Ball, Balance=Agility; other nearest-field mappings documented in ratingsMethod";
  p.hiddenSource = potential !== null
    ? "2K27 Potential mapped; other hidden attributes remain unscouted neutral baseline"
    : "No 2K27 Potential rating; neutral baseline 10; other hidden attributes remain unscouted neutral baseline";
}

const db = JSON.parse(await fs.readFile(FILE, "utf8"));
const sources = await fetchAll();
const byName = new Map(sources.map(s => [norm(s.name), s]));
const aliases = {
  "mobamba": "Mohamed Bamba",
  "jimmybutleriii": "Jimmy Butler",
  "nicclaxton": "Nicolas Claxton",
  "ronaldhollandii": "Ron Holland",
  "bronnyjames": "Bronny James Jr.",
  "svimykhailiuk": "Sviatoslav Mykhailiuk",
  "labaronphilon": "Labaron Philon Jr.",
  "alexsarr": "Alexandre Sarr",
  "bubcarrington": "Carlton Carrington",
  "robdillingham": "Robert Dillingham",
};
let matched = 0;
const matchedSourceNames = new Set();
const unmatchedSource = [];
for (const p of db.players) {
  const source = byName.get(norm(p.name)) || byName.get(norm(aliases[norm(p.name)]));
  if (!source) continue;
  applyPlayer(p, source);
  matchedSourceNames.add(norm(source.name));
  matched++;
}

// Enrique Freeman is a verified 2K27 free agent, so he is absent from the current-team API slice.
const enrique = db.players.find(p => norm(p.name) === norm("Enrique Freeman"));
if (enrique && !matchedSourceNames.has(norm("Enrique Freeman"))) {
  const source = {
    name: "Enrique Freeman", slug: "enrique-freeman", team: "Free Agent",
    positions: ["PF", "C"], overall: 69, height: "6'9\"", weight: "220 lbs",
    manualSource: "NBA 2K27 detailed attributes (2kAuction)",
    manualUrl: "https://2kauction.com/mynba/players/enrique-freeman",
    attributes: {
      drivingLayup:74, drivingDunk:80, standingDunk:60, postControl:62, drawFoul:40,
      closeShot:74, midRangeShot:66, threePointShot:66, freeThrow:67, shotIQ:35, offensiveConsistency:30,
      passAccuracy:59, passVision:32, passIQ:60, ballHandle:62, speedWithBall:59,
      interiorDefense:66, perimeterDefense:66, steal:35, block:56, helpDefenseIQ:68,
      passPerception:63, defensiveConsistency:50, offensiveRebound:40, defensiveRebound:57,
      speed:74, agility:74, strength:60, vertical:81, stamina:88, hustle:95,
      intangibles:70, potential:77, reactionTime:62
    }
  };
  applyPlayer(enrique, source);
  enrique.ratingsSource = source.manualSource;
  enrique.ratingsSourceUrl = source.manualUrl;
  enrique.ratingsScale = "2K27 0-100 mapped to game 1-20; overall retained on 0-99";
  enrique.ratingsStatus = "2K-direct-27";
}

for (const s of sources) if (!matchedSourceNames.has(norm(s.name))) unmatchedSource.push(s.name);
for (const p of db.players) {
  if (!p.ratingsStatus || p.ratingsStatus === "unverified") {
    p.ratingsStatus = "unverified";
    p.ratingsSource = "No NBA 2K27 player rating found; no 2K rating assigned";
    p.ratingsScale = "unverified; no NBA 2K27 rating available";
    p.ratingsConfidence = "low";
    p.ratingsUpdatedAt = today;
    p.screenSource = "No verified NBA 2K27 source; player remains unverified";
    p.hiddenSource = "Potential remains a legacy estimate; other hidden attributes remain unscouted neutral baseline";
  }
}
if (matched < 450) throw new Error("Safety stop: matched only " + matched + " of " + sources.length + " 2K27 players to game roster");

// Do not invent ratings for players absent from NBA 2K27. Keep the game roster strictly 2K-rated.
const excludedUnverified = db.players.filter(p => p.ratingsStatus !== "2K-direct-27").map(p => p.name);
db.players = db.players.filter(p => p.ratingsStatus === "2K-direct-27");
db.count = db.players.length;

const counts = {};
for (const p of db.players) counts[p.ratingsStatus || "unverified"] = (counts[p.ratingsStatus || "unverified"] || 0) + 1;
const unverified = db.players.filter(p => !p.ratingsStatus || p.ratingsStatus === "unverified").map(p => p.name);
const partial = db.players.filter(p => p.ratingsStatus === "2K-partial").map(p => p.name);
db.snapshot = today;
db.updatedAt = new Date().toISOString();
db.source = `${today}: NBA 2K27 ratings synced from NBA 2K API/2KRatings; ${db.players.length} players retained with verified 2K27 ratings; ${excludedUnverified.length} players without 2K27 ratings excluded`;
db.ratingNotes = "Only verified NBA 2K27 players are included. Every sync rebuilds all 36 visible attributes from 2K27 source values (0-100 mapped to game 1-20 by round(value/5)); OVR is copied directly. Rebound=Defensive Rebound; Dunk=Driving Dunk; Acceleration=Speed With Ball; Balance=Agility; Screen=Strength. Game-only mental/role fields use nearest 2K values (e.g. anticipation=Help Defense IQ, decisions=Shot IQ, composure/leadership/flair=Intangibles, work rate/aggression/determination=Hustle). Old game values, career-stat formulas, height-based estimates, and player-specific overrides are never retained.";
db.ratingsMethod = "NBA 2K27 is the sole source of truth (NBA 2K API/2KRatings; verified free agents from 2kAuction). Every playable player has a verified 2K27 source. Each sync starts every player attribute from an empty object and rebuilds all 36 visible attributes from 2K27 source fields mapped to 1-20 by Math.round(value/5); OVR is copied directly. Game-only fields map to the nearest 2K field: Screen=Strength, Acceleration=Speed With Ball, Balance=Agility, Anticipation=Help Defense IQ (Pass Perception fallback), Decisions=Shot IQ, Vision=Pass Vision, Composure/Leadership/Flair=Intangibles, Concentration=Shot IQ, Teamwork/Pass Technique=Pass IQ, Work Rate/Aggression/Determination=Hustle, Off-ball=Offensive Consistency, Positioning=Defensive Consistency. Rebound=Defensive Rebound; Dunk=Driving Dunk. Missing source attributes fail the sync rather than preserving old values. No player-specific overrides or legacy formulas. Players without verified 2K27 data are excluded.";
db.ratingsCoverage = {
  ...(db.ratingsCoverage || {}),
  sourceRows: sources.length,
  source2K25Rows: counts["2K-direct-25"] || 0,
  source2K26Rows: counts["2K-direct"] || 0,
  ratingsCounts: counts,
  playersTotal: db.players.length,
  excludedUnverifiedNames: excludedUnverified,
  playersWith2KRatings: db.players.filter(p => String(p.ratingsStatus || "").startsWith("2K-direct")).length,
  unverifiedPlayers: unverified.length,
  unverifiedNames: unverified,
  partialPlayers: partial.length,
  partialNames: partial,
  direct2K27Matched: matched,
  totalVerified2K27Players: db.players.length,
  manual2K27Rows: db.players.filter(p => p.ratingsStatus === "2K-direct-27" && String(p.ratingsSource || "").includes("2kAuction")).length,
  source2K27Rows: sources.length,
  dunkMapping: "Direct Driving Dunk only; no blended rating",
  accelerationMapping: "Direct 2K27 Speed with Ball (no separate Acceleration rating)",
  hiddenAttributeCoverage: "Seven hidden attributes are neutral/unscouted; potential is direct 2K27 only, otherwise neutral baseline 10",
  screenAttributeCoverage: "Screen maps to direct 2K Strength; aggression maps to direct 2K Hustle",
  allPlayersEvaluatedByDirect2K: db.players.every(p => p.ratingsStatus === "2K-direct-27"),
  unmatched2K27SourceNames: unmatchedSource,
};
delete db.ratingsCoverage.dunkFormula;
delete db.ratingsCoverage.accelerationProxy;
await fs.writeFile(FILE, JSON.stringify(db, null, 2) + "\n");
console.log(JSON.stringify({sourceRows:sources.length,matched,unverified:unverified.length,partial:partial.length,unmatchedSource:unmatchedSource.length,counts},null,2));
