const date="20260215";
const r=await fetch("https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates="+date,{headers:{"Accept":"application/json"},signal:AbortSignal.timeout(15000)});
const d=await r.json();
console.log("ALLSTAR_SCOREBOARD",JSON.stringify((d.events||[]).map(e=>({id:e.id,name:e.name,shortName:e.shortName,notes:e.competitions?.[0]?.notes}))));
