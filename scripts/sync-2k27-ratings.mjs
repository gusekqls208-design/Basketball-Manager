#!/usr/bin/env node
/**
 * Sync current NBA 2K27 ratings into the Basketball Manager roster.
 * Source: NBA 2K API public endpoint (weekly 2K27 ratings data).
 * Only direct 2K attributes are overwritten. Non-2K mental/role proxies remain
 * explicitly documented; players absent from the 2K current roster are not guessed.
 */
import fs from "node:fs/promises";

const FILE = "players-2026-27.json";
const BASE = "https://api.nba2kapi.com/api/public/players";
const today = new Date().toISOString().slice(0, 10);

const norm = (s) => String(s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
const asNum = (v) => typeof v === "number" && Number.isFinite(v) ? v : null;
const to20 = (v) => v == null ? null : Math.max(1, Math.min(20, Math.round(v / 5)));
const mean = (...xs) => {
  const vals = xs.map(asNum).filter(v => v !== null);
  return vals.length ? vals.reduce((a,b)=>a+b,0) / vals.length : null;
};
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
  const old = p.attrs || {};
  const next = { ...old };

  const direct = {
    close: ["closeShot"],
    layup: ["drivingLayup"],
    mid: ["midRangeShot"],
    three: ["threePointShot"],
    ft: ["freeThrow"],
    post: ["postControl"],
    handle: ["ballHandle"],
    pass: ["passAccuracy"],
    passTech: ["passIQ"],
    perimeter: ["perimeterDefense"],
    interior: ["interiorDefense"],
    steal: ["steal"],
    block: ["block"],
    anticipation: ["helpDefenseIQ"],
    decisions: ["shotIQ"],
    vision: ["passVision"],
    offBall: ["offensiveConsistency"],
    positioning: ["defensiveConsistency"],
    composure: ["intangibles", "intangible"],
    concentration: ["reactionTime"],
    teamwork: ["passIQ"],
    workRate: ["hustle"],
    leadership: ["intangibles", "intangible"],
    determination: ["hustle"],
    flair: ["drawFoul"],
    speed: ["speed"],
    acceleration: ["acceleration"],
    agility: ["agility"],
    jumping: ["vertical"],
    strength: ["strength"],
    stamina: ["stamina"],
  };
  for (const [target, keys] of Object.entries(direct)) setMapped(next, target, pick(a, ...keys));

  const driving = pick(a, "drivingDunk");
  const standing = pick(a, "standingDunk");
  const dunk = driving !== null && standing !== null ? driving * 0.75 + standing * 0.25 : (driving ?? standing);
  setMapped(next, "dunk", dunk);

  const rebound = mean(pick(a, "offensiveRebound"), pick(a, "defensiveRebound"));
  setMapped(next, "rebound", rebound);

  const balance = mean(pick(a, "agility"), pick(a, "strength"));
  setMapped(next, "balance", balance);

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
  if (potential !== null) p.hidden = { ...(p.hidden || {}), potential: to20(potential) };

  p.ratingsSource = "NBA 2K27 current roster (NBA 2K API; sourced from 2KRatings)";
  p.ratingsSourceUrl = "https://nba2kapi.com";
  p.ratingsSourcePlayer = source.name || p.name;
  p.ratingsScale = "2K27 0-100 mapped to game 1-20 by round(value/5); OVR retained on 0-99";
  p.ratingsUpdatedAt = today;
  p.ratingsStatus = "2K-direct-27";
  p.hiddenSource = potential !== null
    ? "2K27 potential mapped; other hidden attributes remain unscouted neutral baseline"
    : "unscouted neutral baseline for hidden attributes";
}

const db = JSON.parse(await fs.readFile(FILE, "utf8"));
const sources = await fetchAll();
const byName = new Map(sources.map(s => [norm(s.name), s]));
let matched = 0;
const unmatchedSource = [];
for (const p of db.players) {
  const source = byName.get(norm(p.name));
  if (!source) continue;
  applyPlayer(p, source);
  matched++;
}
for (const s of sources) if (!db.players.some(p => norm(p.name) === norm(s.name))) unmatchedSource.push(s.name);

if (matched < 450) throw new Error(`Safety stop: matched only ${matched} of ${sources.length} 2K27 players to game roster`);

const counts = {};
for (const p of db.players) counts[p.ratingsStatus || "unverified"] = (counts[p.ratingsStatus || "unverified"] || 0) + 1;
const unverified = db.players.filter(p => p.ratingsStatus !== "2K-direct-27" && !String(p.ratingsStatus || "").startsWith("2K-direct")).map(p => p.name);
db.snapshot = today;
db.updatedAt = new Date().toISOString();
db.source = `${today}: NBA 2K27 current roster ratings synced from NBA 2K API public endpoint; ${matched} of ${db.players.length} game-roster players matched; unmatched players retain prior verified source or remain unverified`;
db.ratingNotes = "1-20 scale. Direct NBA 2K27 attributes are mapped from 0-100 by rounding rating/5; dunk = 75% Driving Dunk + 25% Standing Dunk; rebound = mean of Offensive and Defensive Rebound. Non-direct mental/role attributes are documented proxies, not direct 2K ratings. Six hidden attributes remain neutral/unscouted unless separately verified; potential is mapped from 2K27 when available.";
db.ratingsMethod = "Current NBA 2K27 source: NBA 2K API public current-roster endpoint, which republishes 2KRatings data. Direct attributes map by Math.round(value/5) to game 1-20. Dunk uses 75% Driving Dunk + 25% Standing Dunk; rebound uses mean of Offensive Rebound and Defensive Rebound. Acceleration uses the direct 2K27 Acceleration attribute. Balance is the mean of Agility and Strength because no separate balance attribute is published. Mental/role fields without direct 2K equivalents use documented proxies (Intangibles, Hustle, Shot IQ, Help Defense IQ, Pass IQ, Pass Perception, offensive/defensive consistency, Reaction Time, Draw Foul).";
db.ratingsCoverage = {
  ...(db.ratingsCoverage || {}),
  sourceRows: sources.length,
  ratingsCounts: counts,
  playersTotal: db.players.length,
  playersWith2KRatings: db.players.filter(p => String(p.ratingsStatus || "").startsWith("2K-direct")).length,
  unverifiedPlayers: unverified.length,
  unverifiedNames: unverified,
  direct2K27Matched: matched,
  source2K27Rows: sources.length,
  allPlayersEvaluatedByDirect2K: matched === db.players.length,
  unmatched2K27SourceNames: unmatchedSource,
};
await fs.writeFile(FILE, JSON.stringify(db, null, 2) + "\n");
console.log(JSON.stringify({sourceRows:sources.length,matched,unverified:unverified.length,unmatchedSource:unmatchedSource.length,counts},null,2));
