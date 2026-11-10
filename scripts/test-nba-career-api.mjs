const url="https://site.web.api.espn.com/apis/common/v3/sports/basketball/nba/athletes/1966/gamelog?season=2026";
const r=await fetch(url,{headers:{"Accept":"application/json","User-Agent":"BasketballManager-HiddenScout/1.0"},signal:AbortSignal.timeout(15000)});
console.log("HTTP",r.status);
const d=await r.json();
console.log("SHAPE",JSON.stringify({keys:Object.keys(d),eventsType:typeof d.events,eventsArray:Array.isArray(d.events),events:JSON.stringify(d.events).slice(0,2000),seasonTypes:JSON.stringify(d.seasonTypes).slice(0,4000),labels:d.labels,names:d.names}));
