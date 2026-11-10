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
  const recent=done.slice(0,10);
  const gp=recent.reduce((n,r)=>n+Math.min(r.gp,seasonGames(r.year)),0);
  const expected=recent.reduce((n,r)=>n+seasonGames(r.year),0);
  const availability=expected?gp/expected:0;
  const injuryRaw=availability>=.97?2:availability>=.93?3:availability>=.88?4:availability>=.83?5:availability>=.78?6:availability>=.73?7:availability>=.68?8:availability>=.63?9:availability>=.58?10:availability>=.53?11:availability>=.48?12:availability>=.40?13:availability>=.30?14:15;
  const sample=Math.min(1,recent.length/5);
  p.hidden.injuryProneness=clamp(10+(injuryRaw-10)*sample,1,15);
  p.hiddenEvidence.injuryProneness="ESPN 정규시즌 출전 경기/시즌별 예정 경기 비율(최근 최대 10시즌), 표본 보정 · 1~15";
  if(done.length>=3){
    const pp=done.map(r=>r.pts||0),mean=pp.reduce((a,b)=>a+b,0)/pp.length;
    const cv=mean>0?Math.sqrt(pp.reduce((a,b)=>a+(b-mean)**2,0)/pp.length)/mean:0;
    const rates=done.map(r=>r.gp/seasonGames(r.year)),avg=rates.reduce((a,b)=>a+b,0)/rates.length;
    const sd=Math.sqrt(rates.reduce((a,b)=>a+(b-avg)**2,0)/rates.length);
    p.hidden.consistency=clamp(17-Math.min(8,cv*9)-Math.min(5,sd*12)+Math.max(0,avg-.85)*8);
    p.hiddenEvidence.consistency="ESPN 다년간 평균 득점 변동계수 + 시즌별 출전율";
  }
  const po=done.filter(r=>r.playoffs?.gp>0);
  const poGp=po.reduce((n,r)=>n+r.playoffs.gp,0);
  if(poGp>=8){
    const regPts=done.reduce((n,r)=>n+r.pts*r.gp,0)/Math.max(1,done.reduce((n,r)=>n+r.gp,0));
    const poPts=po.reduce((n,r)=>n+r.playoffs.pts*r.playoffs.gp,0)/poGp;
    const uplift=regPts>0?(poPts-regPts)/regPts:0;
    p.hidden.importantMatches=clamp(10+Math.max(-.35,Math.min(.5,uplift))*18+Math.min(4,poGp/35));
    p.hidden.pressure=clamp(10+Math.max(-.3,Math.min(.4,uplift))*15+Math.min(3,poGp/45));
    p.hiddenEvidence.importantMatches="ESPN 플레이오프 누적 출전 및 정규시즌 대비 플레이오프 평균 득점 변화(클러치 공식 지표 아님)";
    p.hiddenEvidence.pressure="ESPN 플레이오프 득점 변화와 출전 표본 기반 대리 지표(공식 클러치 지표 아님)";
  }
  p.hidden.injuryProneness=clamp(p.hidden.injuryProneness,1,15);
  p.career=done.map(r=>({season:(r.year-1)+"-"+String(r.year).slice(-2),team:r.team||"NBA",gp:r.gp,pts:r.pts,reb:r.reb,ast:r.ast,stl:r.stl,blk:r.blk,playoffs:r.playoffs||null}));
  p.careerLoaded=true;
  p.careerSource="ESPN 시즌별 정규시즌·플레이오프 기록 일괄 수집";
  p.hiddenScoutedAt=new Date().toISOString();
  p.hiddenSource="ESPN 전 커리어 기록 기반 일괄 스카우팅 · 데이터로 판정 불가한 항목은 중립 10 유지";
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
  try{
    const q=await getJson("https://site.web.api.espn.com/apis/search/v2?query="+encodeURIComponent(p.name)+"&limit=10&sport=basketball");
    const arr=collectSearchCandidates(q);
    const hit=arr.find(a=>norm(a.displayName||a.fullName||a.name||a.shortName)===norm(p.name));
    const id=hit?.id||String(hit?.uid||"").match(/a:(\\d+)/)?.[1];
    if(id)p.espnId=String(id);
  }catch{}
});
const targets=db.players.filter(p=>p.espnId&&!p.hiddenScoutedAt);
if(!targets.length)throw new Error("No remaining ESPN career records to scout");
let completed=0,failed=[];
await mapLimit(targets,5,async p=>{
  try{
    let experience=Number(p.experience)||Math.max(1,(Number(p.age)||25)-18);
    try{
      const bio=await getJson("https://sports.core.api.espn.com/v2/sports/basketball/leagues/nba/athletes/"+p.espnId);
      if(Number.isFinite(Number(bio?.experience?.years))&&Number(bio.experience.years)>0)experience=Number(bio.experience.years);
    }catch{}
    const count=Math.max(1,Math.min(27,Math.floor(experience)+1));
    const years=Array.from({length:count},(_,i)=>2026-i);
    const rows=[];
    for(const year of years){
      const [regular,post]=await Promise.all([
        getJson("https://site.web.api.espn.com/apis/common/v3/sports/basketball/nba/athletes/"+p.espnId+"/stats?season="+year),
        getJson("https://site.web.api.espn.com/apis/common/v3/sports/basketball/nba/athletes/"+p.espnId+"/stats?season="+year+"&seasontype=3")
      ]);
      const s=parseStats(regular),gp=s.GP||0;
      if(gp>0){
        const ps=parseStats(post),pgp=ps.GP||0;
        rows.push({year,gp,pts:s.PTS||0,reb:s.REB||0,ast:s.AST||0,stl:s.STL||0,blk:s.BLK||0,team:(Array.isArray(regular?.teams)?regular.teams:Object.values(regular?.teams||{})).map(t=>t?.abbreviation||t?.displayName).filter(Boolean).join("/"),playoffs:pgp>0?{gp:pgp,pts:ps.PTS||0,reb:ps.REB||0,ast:ps.AST||0}:null});
      }
      await sleep(90);
    }
    if(!rows.length)throw new Error("No career season rows");
    p.career=rows.sort((a,b)=>b.year-a.year);
    scoreHidden(p,rows);
    completed++;
  }catch(e){failed.push({name:p.name,error:String(e.message||e)});}
});
for(const p of db.players){
  p.hidden={consistency:10,importantMatches:10,pressure:10,professionalism:10,injuryProneness:10,naturalFitness:10,adaptability:10,potential:10,...(p.hidden||{})};
  p.hidden.injuryProneness=clamp(p.hidden.injuryProneness,1,15);
  p.hiddenEvidence=p.hiddenEvidence||{};
  if(!p.hiddenEvidence.potential&&Number.isFinite(Number(p.hidden.potential))&&Number(p.hidden.potential)!==10)p.hiddenEvidence.potential="NBA 2K27 Potential";
  p.hiddenReviewedAt=new Date().toISOString();
  if(p.hiddenScoutedAt)p.hiddenScoutingStatus="career-records";
  else if(p.espnId)p.hiddenScoutingStatus="no-NBA-career-records";
  else p.hiddenScoutingStatus="ESPN-id-unresolved";
}
const scouted=db.players.filter(p=>p.hiddenScoutedAt).length;
console.log("SCOUT_DIAGNOSTICS",JSON.stringify({rosterTeams:rosterByTeam.size,players:db.players.length,targets:targets.length,scouted,failed:failed.length,sampleFailures:failed.slice(0,12)}));
if(scouted<480)throw new Error("Safety stop: only "+scouted+" players were successfully scouted; data file not written");
db.hiddenScouting={version:1,source:"ESPN NBA player season statistics",updatedAt:new Date().toISOString(),totalPlayers:db.players.length,processedPlayers:db.players.filter(p=>p.hiddenReviewedAt).length,scoutedPlayers:scouted,noCareerDataPlayers:db.players.filter(p=>p.hiddenScoutingStatus!=="career-records").length,failedPlayers:failed.length,failedNames:failed.map(x=>x.name),notes:"Injury frequency is estimated from games played/expected season games, not a verified medical injury log. ImportantMatches and Pressure use playoff-vs-regular scoring as a proxy, not official clutch-time tracking. Professionalism, NaturalFitness and Adaptability remain neutral where public career stats cannot establish them; Potential remains NBA 2K27 Potential when available."};
db.updatedAt=new Date().toISOString();
await fs.writeFile(FILE,JSON.stringify(db,null,2)+"\n");
console.log(JSON.stringify({players:db.players.length,scouted,failed:failed.length,failedNames:failed.map(x=>x.name)},null,2));
if(failed.length>Math.max(40,db.players.length*.1))throw new Error("Too many players failed career scouting");
