for(const date of ["20231209","20241217","20251216"]){
 const u="https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates="+date;
 const r=await fetch(u,{headers:{"Accept":"application/json"},signal:AbortSignal.timeout(15000)});
 const d=await r.json();
 console.log("SCOREBOARD",date,JSON.stringify((d.events||[]).map(e=>({id:e.id,name:e.name,shortName:e.shortName,date:e.date,notes:e.competitions?.[0]?.notes,venue:e.competitions?.[0]?.venue?.fullName}))));
}
for(const season of [2026,2024,2023]){
 const u="https://site.web.api.espn.com/apis/common/v3/sports/basketball/nba/athletes/1966/gamelog?season="+season;
 const r=await fetch(u,{headers:{"Accept":"application/json"},signal:AbortSignal.timeout(15000)});
 const d=await r.json();
 const regular=(d.seasonTypes||[]).find(st=>/regular season$/i.test(st.displayName||"")&&!/play.?in/i.test(st.displayName||""));
 const es=(regular?.categories||[]).flatMap(c=>c.events||[]);
 const special=es.map(e=>({id:e.eventId||e.id,meta:d.events?.[String(e.eventId||e.id)]})).filter(x=>/all.?star|team-|stars|stripes|world|cup|tournament/i.test(JSON.stringify(x.meta?.links||[])));
 console.log("SPECIAL_LINKS",season,JSON.stringify(special.map(x=>({id:x.id,links:x.meta?.links}))));
}
