for(const season of [2026,2025]){
 const url="https://site.web.api.espn.com/apis/common/v3/sports/basketball/nba/athletes/1966/gamelog?season="+season;
 const r=await fetch(url,{headers:{"Accept":"application/json","User-Agent":"BasketballManager-HiddenScout/1.0"},signal:AbortSignal.timeout(15000)});
 const d=await r.json();
 console.log("SEASON_SHAPE",season,JSON.stringify({filter:d.filters?.find(x=>x.name==="season")?.value,eventCount:Object.keys(d.events||{}).length,seasonTypes:(d.seasonTypes||[]).map(st=>({displayName:st.displayName,displayTeam:st.displayTeam,categories:(st.categories||[]).map(c=>({displayName:c.displayName,type:c.type,splitType:c.splitType,totals:c.totals})),summary:st.summary?.stats?.[0]?.stats}))}));
}
