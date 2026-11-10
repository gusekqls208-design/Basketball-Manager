for(const season of [2026,2025]){
 const url="https://site.web.api.espn.com/apis/common/v3/sports/basketball/nba/athletes/1966/gamelog?season="+season;
 const r=await fetch(url,{headers:{"Accept":"application/json","User-Agent":"BasketballManager-HiddenScout/1.0"},signal:AbortSignal.timeout(15000)});
 console.log("ESPN_GAMELOG_HTTP",season,r.status);
 const body=await r.text();
 console.log("ESPN_GAMELOG_HEAD",season,body.slice(0,300));
 if(!r.ok)continue;
 const d=JSON.parse(body);
 console.log("ESPN_GAMELOG_META",season,JSON.stringify({keys:Object.keys(d),filters:d.filters,labels:d.labels,names:d.names,eventCount:d.events?.length,first:d.events?.[0]}));
}
