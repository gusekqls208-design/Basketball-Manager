#!/usr/bin/env node
import fs from "node:fs/promises";

const FILE = "players-2026-27.json";
const TEAM_IDS = {ATL:1,BOS:2,BKN:17,CHA:30,CHI:4,CLE:5,DAL:6,DEN:7,DET:8,GSW:9,HOU:10,IND:11,LAC:12,LAL:13,MEM:29,MIA:14,MIL:15,MIN:16,NOP:3,NYK:18,OKC:25,ORL:19,PHI:20,PHX:21,POR:22,SAC:23,SAS:24,TOR:28,UTA:26,WAS:27};
const norm = s => String(s||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]/gi,"").toLowerCase();
const clamp = (v,lo=1,hi=20) => Math.max(lo,Math.min(hi,Math.round(v)));
const sleep = ms => new Promise(r=>setTimeout(r,ms));
async function getJson(url, tries=4) {
  let last;
  for(let i=0;i<tries;i++){
    try{
      const r=await fetch(url,{headers:{"Accept":"application/json","User-Agent":"BasketballManager-HiddenScout/1.0"}});
      if(r.status===404)return null;
      if(r.status===429||r.status>=500){await sleep(700*(i+1));continue;}
      if(!r.ok)throw new Error("HTTP "+r.status+" "+url);
      return await r.json();
    }catch(e){last=e;await sleep(500*(i+1));}
  }
  throw last||new Error("Request failed: "+url);
}
async function mapLimit(items,limit,fn){
  const out=new Array(items.length);let next=0;
  await Promise.all(Array.from({length:limit},async()=>{
    while(true){const i=next++;if(i>=items.length)return;out[i]=await fn(items[i],i);}
  }));
  return out;
}
function parseStats(data){
  const out={};
  for(const c of data?.categories||data?.statCategories||[]){
    const labels=c.labels||c.names||[],vals=c.totals||c.values||[];
    labels.forEach((label,i)=>{
      const key=String(label||"").toUpperCase().replace(/[^A-Z0-9%]/g,"");
      const n=Number(String(vals[i]??"").replace(/,/g,""));
      if(key&&Number.isFinite(n))out[key]=n;
    });
  }
  return out;
}
function seasonGames(year){
  if(year===1999)return 50;
  if(year===2012)return 66;
  if(year===2020)return 71;
  if(year===2021)return 72;
  return 82;
}
function scoreHidden(p,rows){
  const done=rows.filter(r=>r.gp>0);
  if(!done.length)return false;
  p.hidden={...(p.hidden||{})};
  p.hiddenEvidence={...(p.hiddenEvidence||{})};
  const completed=done.filter(r=>r.year<2027);
  const nbaRows=completed.filter(r=>r.league==="NBA");
  const ncaaRows=completed.filter(r=>r.league==="NCAA");
  const availabilityRows=nbaRows.length?nbaRows:completed;
  const consistencyRows=nbaRows.length>=3?nbaRows:(ncaaRows.length>=3?ncaaRows:(nbaRows.length?nbaRows:completed));
  const recent=availabilityRows.slice(0,10);
  const expectedFor=r=>Number(r.expectedGames)||seasonGames(r.year);
  const gp=recent.reduce((n,r)=>n+Math.min(r.gp,expectedFor(r)),0);
  const expected=recent.reduce((n,r)=>n+expectedFor(r),0);
  const availability=expected?gp/expected:0;
  const injuryRaw=availability>=.97?2:availability>=.93?3:availability>=.88?4:availability>=.83?5:availability>=.78?6:availability>=.73?7:availability>=.68?8:availability>=.63?9:availability>=.58?10:availability>=.53?11:availability>=.48?12:availability>=.40?13:availability>=.30?14:15;
  const sample=Math.min(1,recent.length/5);
  p.hidden.injuryProneness=clamp(10+(injuryRaw-10)*sample,1,15);
  p.hiddenEvidence.injuryProneness=(availabilityRows[0]?.league||"NBA")+" completed-season games played ÷ expected games, last 10 seasons; estimate, not medical injury log · 1-15";
  if(consistencyRows.length>=3){
    const pp=consistencyRows.map(r=>r.pts||0),mean=pp.reduce((a,b)=>a+b,0)/pp.length;
    const cv=mean>0?Math.sqrt(pp.reduce((a,b)=>a+(b-mean)**2,0)/pp.length)/mean:0;
    const rates=consistencyRows.map(r=>r.gp/expectedFor(r)),avg=rates.reduce((a,b)=>a+b,0)/Math.max(1,rates.length);
    const sd=Math.sqrt(rates.reduce((a,b)=>a+(b-avg)**2,0)/Math.max(1,rates.length));
    p.hidden.consistency=clamp(17-Math.min(8,cv*9)-Math.min(5,sd*12)+Math.max(0,avg-.85)*8);
    p.hiddenEvidence.consistency=(consistencyRows[0]?.league||"NBA")+" multi-season PPG variation + season availability";
  }
  const nbaPo=nbaRows.filter(r=>r.playoffs?.gp>0);
  const nbaPoGp=nbaPo.reduce((n,r)=>n+r.playoffs.gp,0);
  const playoffRows=nbaPoGp>=8?nbaPo:(nbaRows.length?[]:completed.filter(r=>r.playoffs?.gp>0));
  const poGp=playoffRows.reduce((n,r)=>n+r.playoffs.gp,0);
  if(poGp>=8){
    const regularRows=playoffRows.map(po=>completed.find(r=>r.year===po.year&&r.league===po.league)).filter(Boolean);
    const regPts=regularRows.reduce((n,r)=>n+r.pts*r.gp,0)/Math.max(1,regularRows.reduce((n,r)=>n+r.gp,0));
    const poPts=playoffRows.reduce((n,r)=>n+r.playoffs.pts*r.playoffs.gp,0)/poGp;
    const uplift=regPts>0?(poPts-regPts)/regPts:0;
    p.hidden.importantMatches=clamp(10+Math.max(-.35,Math.min(.5,uplift))*18+Math.min(4,poGp/35));
    p.hidden.pressure=clamp(10+Math.max(-.3,Math.min(.4,uplift))*15+Math.min(3,poGp/45));
    p.hiddenEvidence.importantMatches=(playoffRows[0]?.league||"NBA")+" postseason performance vs regular season (not official clutch tracking)";
    p.hiddenEvidence.pressure=(playoffRows[0]?.league||"NBA")+" postseason scoring change and sample size (proxy, not official clutch tracking)";
  }
  p.hidden.injuryProneness=clamp(p.hidden.injuryProneness,1,15);
  p.career=done.map(r=>({season:(r.year-1)+"-"+String(r.year).slice(-2),league:r.league||"NBA",team:r.team||"NBA",gp:r.gp,pts:r.pts,reb:r.reb,ast:r.ast,stl:r.stl,blk:r.blk,playoffs:r.playoffs||null}));
  p.careerLoaded=true;
  p.careerSource=done.some(r=>r.league==="NCAA")?"ESPN NBA + NCAA season-by-season game logs":done.some(r=>String(r.league||"").startsWith("Euro"))?"EuroLeague/EuroCup season-by-season records":"ESPN NBA season-by-season game logs";
  p.hiddenScoutedAt=new Date().toISOString();
  p.hiddenSource="시즌별 경기 로그 기반 일괄 스카우팅 · 데이터로 판정할 수 없는 항목은 중립값";
  return true;
}

const db=JSON.parse(await fs.readFile(FILE,"utf8"));
if(!Array.isArray(db.players)||db.players.length<500)throw new Error("Roster validation failed");
const rosterByTeam=new Map();
await mapLimit(Object.entries(TEAM_IDS),5,async([abbr,id])=>{
  const data=await getJson("https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams/"+id+"/roster?season=2027");
  const athletes=(data?.athletes||[]).filter(a=>a?.id&&a?.displayName);
  if(athletes.length)rosterByTeam.set(abbr,athletes);
});
const byName=new Map();
for(const [team,athletes] of rosterByTeam)for(const a of athletes)byName.set(norm(a.displayName),{id:String(a.id),team});
const manualIds={"Labaron Philon Jr.":"4873090","Labaron Philon":"4873090","Bobby Portis Jr.":"3064482","Bobby Portis":"3064482"};
for(const p of db.players)if(manualIds[p.name])p.espnId=manualIds[p.name];
let unmatched=[];
for(const p of db.players){
  const hit=byName.get(norm(p.name));
  if(hit){p.espnId=hit.id;p.teamAbbr=hit.team;}
  else unmatched.push(p);
}
function collectSearchCandidates(value,out=[]){
  if(Array.isArray(value)){for(const x of value)collectSearchCandidates(x,out);return out;}
  if(!value||typeof value!=="object")return out;
  const name=value.displayName||value.fullName||value.name||value.shortName;
  if(name&&(value.id||value.uid))out.push(value);
  for(const v of Object.values(value))if(v&&typeof v==="object")collectSearchCandidates(v,out);
  return out;
}
await mapLimit(unmatched,2,async p=>{
  const cleanName=p.name.replace(/,?\\s+(?:jr\\.?|sr\\.?|iii|ii)$/i,"").trim();
  const variants=[p.name,cleanName].filter((v,i,a)=>v&&a.indexOf(v)===i);
  for(const name of variants){
    try{
      const q=await getJson("https://site.web.api.espn.com/apis/search/v2?query="+encodeURIComponent(name)+"&limit=10&sport=basketball");
      const arr=collectSearchCandidates(q);
      const hit=arr.find(a=>[a.displayName,a.fullName,a.name,a.shortName].some(v=>norm(v)===norm(name)||norm(v)===norm(p.name)));
      const uid=String(hit?.uid||"");
      const id=uid.match(/a:(\\d+)/)?.[1]||(/^\\d+$/.test(String(hit?.id||""))?String(hit.id):null);
      if(id){p.espnId=String(id);break;}
    }catch{}
  }
});
for(const p of db.players){
  p.hiddenScoutedAt="";
  p.hidden={...(p.hidden||{}),consistency:10,importantMatches:10,pressure:10,injuryProneness:10};
  p.hiddenEvidence={...(p.hiddenEvidence||{})};
  for(const k of ["consistency","importantMatches","pressure","injuryProneness"])delete p.hiddenEvidence[k];
}
const internationalNames=new Set(["Tarik Biberovic","Khalifa Diop"]);
const targets=db.players.filter(p=>p.espnId&&!internationalNames.has(p.name));
if(targets.length<500)throw new Error("ESPN ID coverage too low: "+targets.length+"/"+db.players.length);
let completed=0,failed=[];
await mapLimit(targets,5,async p=>{
  try{
    let experience=Number(p.experience)||Math.max(1,(Number(p.age)||25)-18);
    try{
      const bio=await getJson("https://sports.core.api.espn.com/v2/sports/basketball/leagues/nba/athletes/"+p.espnId);
      if(Number.isFinite(Number(bio?.experience?.years))&&Number(bio.experience.years)>0)experience=Number(bio.experience.years);
    }catch{}
    const count=Math.max(1,Math.min(27,Math.floor(experience)+1));
    const years=Array.from({length:count+1},(_,i)=>2027-i);
    const rows=[];
    for(const year of years){
      const data=await getJson("https://site.web.api.espn.com/apis/common/v3/sports/basketball/nba/athletes/"+p.espnId+"/gamelog?season="+year);
      const row=parseGameLogSeason(data,year,"NBA",seasonGames(year));
      if(row.gp>0)rows.push(row);
      await sleep(110);
    }
    if(!rows.length||(rows.length<3&&(Number(p.age)||22)<=25)){
      const age=Number(p.age)||22;
      const firstYear=Math.max(2018,2026-Math.max(1,age-18));
      for(let year=2026;year>=firstYear;year--){
        const data=await getJson("https://site.web.api.espn.com/apis/common/v3/sports/basketball/mens-college-basketball/athletes/"+p.espnId+"/gamelog?season="+year);
        const row=parseGameLogSeason(data,year,"NCAA",32);
        if(row.gp>0)rows.push(row);
        await sleep(150);
      }
    }
    if(!rows.length)throw new Error("No NBA or NCAA season game logs");
    p.career=rows.sort((a,b)=>b.year-a.year);
    scoreHidden(p,rows);
    completed++;
  }catch(e){failed.push({name:p.name,error:String(e.message||e)});}
});
const internationalCareer={
  "Tarik Biberovic":[
    {year:2026,gp:41,expectedGames:38,league:"EuroLeague",team:"Fenerbahçe",pts:11.3,reb:3.0,ast:1.3,stl:.4,blk:.1},
    {year:2025,gp:37,expectedGames:34,league:"EuroLeague",team:"Fenerbahçe",pts:10.4,reb:3.1,ast:1.4,stl:.5,blk:.2},
    {year:2024,gp:31,expectedGames:34,league:"EuroLeague",team:"Fenerbahçe",pts:7.0,reb:2.2,ast:.7,stl:.3,blk:0},
    {year:2023,gp:12,expectedGames:34,league:"EuroLeague",team:"Fenerbahçe",pts:2.9,reb:.9,ast:.3,stl:.5,blk:0},
    {year:2022,gp:12,expectedGames:34,league:"EuroLeague",team:"Fenerbahçe",pts:1.4,reb:.4,ast:.3,stl:.3,blk:.1},
    {year:2021,gp:16,expectedGames:34,league:"EuroLeague",team:"Fenerbahçe",pts:2.9,reb:1.5,ast:.3,stl:.2,blk:0},
    {year:2020,gp:6,expectedGames:28,league:"EuroLeague",team:"Fenerbahçe",pts:2.3,reb:1.7,ast:1.0,stl:0,blk:.2},
    {year:2019,gp:8,expectedGames:30,league:"EuroLeague",team:"Fenerbahçe",pts:2.3,reb:1.5,ast:.1,stl:.1,blk:0}
  ],
  "Khalifa Diop":[
    {year:2026,gp:28,expectedGames:38,league:"EuroLeague",team:"Baskonia",pts:4.0,reb:4.2,ast:.6,stl:.5,blk:.6},
    {year:2025,gp:32,expectedGames:34,league:"EuroLeague",team:"Baskonia",pts:4.1,reb:3.6,ast:.5,stl:.3,blk:.5},
    {year:2024,gp:13,expectedGames:34,league:"EuroLeague",team:"Baskonia",pts:2.8,reb:1.9,ast:.3,stl:.2,blk:.2},
    {year:2023,gp:22,expectedGames:18,league:"EuroCup",team:"Gran Canaria",pts:8.2,reb:4.9,ast:.6,stl:.6,blk:.8},
    {year:2022,gp:17,expectedGames:18,league:"EuroCup",team:"Gran Canaria",pts:5.5,reb:3.6,ast:.8,stl:.5,blk:.7},
    {year:2021,gp:14,expectedGames:18,league:"EuroCup",team:"Gran Canaria",pts:2.5,reb:1.6,ast:.4,stl:.5,blk:.3},
    {year:2019,gp:1,expectedGames:34,league:"EuroLeague",team:"Gran Canaria",pts:3.0,reb:4.0,ast:0,stl:1.0,blk:0}
  ]
};
for(const p of db.players){
  const intl=internationalCareer[p.name];
  if(intl&&!p.hiddenScoutedAt){
    scoreHidden(p,intl);
    p.careerSource="Basketball-Reference International / EuroLeague·EuroCup season stats";
    p.hiddenSource="유럽 주요 대회 시즌 기록 기반 일괄 스카우팅 · 클러치·부상 진단 이력은 중립값";
    p.hiddenEvidence.injuryProneness="EuroLeague/EuroCup 시즌별 출전 경기 ÷ 대회별 예정 경기 기반 추정(의료 부상기록 아님)";
    p.hiddenEvidence.consistency="EuroLeague/EuroCup 다년간 평균 득점 변동 + 시즌별 출전율";
    p.hiddenScoutingStatus="international-career-records";
  }
}
failed=failed.filter(x=>!db.players.find(p=>p.name===x.name)?.hiddenScoutedAt);
for(const p of db.players){
  p.hidden={consistency:10,importantMatches:10,pressure:10,professionalism:10,injuryProneness:10,naturalFitness:10,adaptability:10,potential:10,...(p.hidden||{})};
  p.hidden.injuryProneness=clamp(p.hidden.injuryProneness,1,15);
  p.hiddenEvidence=p.hiddenEvidence||{};
  if(!p.hiddenEvidence.potential&&Number.isFinite(Number(p.hidden.potential))&&Number(p.hidden.potential)!==10)p.hiddenEvidence.potential="NBA 2K27 Potential";
  p.hiddenReviewedAt=new Date().toISOString();
  if(p.hiddenScoutedAt)p.hiddenScoutingStatus=p.career?.some(r=>String(r.league||"").startsWith("Euro"))?"international-career-records":p.career?.some(r=>r.league==="NCAA")?"college-career-records":"career-records";
  else if(p.espnId)p.hiddenScoutingStatus="no-NBA-or-NCAA-career-records";
  else p.hiddenScoutingStatus="ESPN-id-unresolved";
}
const scouted=db.players.filter(p=>p.hiddenScoutedAt).length;
console.log("SCOUT_DIAGNOSTICS",JSON.stringify({rosterTeams:rosterByTeam.size,players:db.players.length,targets:targets.length,scouted,failed:failed.length,sampleFailures:failed.slice(0,30),unscouted:db.players.filter(p=>!p.hiddenScoutedAt).map(p=>({name:p.name,team:p.teamAbbr,age:p.age,experience:p.experience,espnId:p.espnId,status:p.hiddenScoutingStatus}))}));
if(scouted<480)throw new Error("Safety stop: only "+scouted+" players were successfully scouted; data file not written");
db.hiddenScouting={version:1,source:"ESPN NBA/NCAA + EuroLeague/EuroCup career season statistics",updatedAt:new Date().toISOString(),totalPlayers:db.players.length,processedPlayers:db.players.filter(p=>p.hiddenReviewedAt).length,scoutedPlayers:scouted,noCareerDataPlayers:db.players.filter(p=>!p.hiddenScoutedAt).length,failedPlayers:failed.length,failedNames:failed.map(x=>x.name),notes:"Injury frequency is estimated from league games played/expected season games, not a verified medical injury log. ImportantMatches and Pressure use playoff-vs-regular scoring as a proxy, not official clutch-time tracking. Professionalism, NaturalFitness and Adaptability remain neutral where public career stats cannot establish them; Potential remains NBA 2K27 Potential when available."};
db.updatedAt=new Date().toISOString();
await fs.writeFile(FILE,JSON.stringify(db,null,2)+"\n");
console.log(JSON.stringify({players:db.players.length,scouted,failed:failed.length,failedNames:failed.map(x=>x.name)},null,2));
if(failed.length>Math.max(40,db.players.length*.1))throw new Error("Too many players failed career scouting");
