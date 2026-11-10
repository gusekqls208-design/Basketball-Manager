for(const season of [2026,2024,2023]){
 const url="https://site.web.api.espn.com/apis/common/v3/sports/basketball/nba/athletes/1966/gamelog?season="+season;
 const r=await fetch(url,{headers:{"Accept":"application/json","User-Agent":"BasketballManager-HiddenScout/1.0"},signal:AbortSignal.timeout(15000)});
 const d=await r.json();
 const pi=(d.seasonTypes||[]).filter(st=>/play.?in/i.test(st.displayName||""));
 const piIds=new Set(pi.flatMap(st=>(st.categories||[]).flatMap(c=>(c.events||[]).map(e=>String(e.eventId||e.id||"")))));
 const regular=(d.seasonTypes||[]).find(st=>/regular season$/i.test(st.displayName||"")&&!/play.?in/i.test(st.displayName||""));
 const regEvents=(regular?.categories||[]).flatMap(c=>c.events||[]);
 const meta=regEvents.map(e=>d.events?.[String(e.eventId||e.id||"")]||{}).filter(e=>/cup|tournament|champion|play.?in/i.test(JSON.stringify(e))).map(e=>({id:e.id,date:e.date,name:e.name,shortName:e.shortName,seasonType:e.seasonType,competitions:e.competitions?.[0]?.notes,links:e.links?.[0]?.href}));
 console.log("SPECIAL",season,JSON.stringify({types:(d.seasonTypes||[]).map(st=>st.displayName),piIds:[...piIds],regCount:regEvents.length,piOverlap:regEvents.filter(e=>piIds.has(String(e.eventId||e.id||""))).length,meta,first:regEvents[0]}));
}
