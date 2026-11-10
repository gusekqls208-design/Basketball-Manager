for(const season of [2024,2023,2022,2021,2020]){
 const url="https://site.web.api.espn.com/apis/common/v3/sports/basketball/nba/athletes/1966/gamelog?season="+season;
 const r=await fetch(url,{headers:{"Accept":"application/json","User-Agent":"BasketballManager-HiddenScout/1.0"},signal:AbortSignal.timeout(15000)});
 const d=await r.json();
 console.log("OLDSEASON",season,JSON.stringify({eventCount:Object.keys(d.events||{}).length,types:(d.seasonTypes||[]).map(st=>({name:st.displayName,cats:(st.categories||[]).map(c=>({name:c.displayName,type:c.type,keys:Object.keys(c),games:c.games,eventsLen:c.events?.length,totals:c.totals}))}))}));
}
