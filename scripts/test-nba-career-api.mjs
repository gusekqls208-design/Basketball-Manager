const url="https://stats.nba.com/stats/playercareerstats?LeagueID=00&PerMode=PerGame&PlayerID=2544";
const r=await fetch(url,{headers:{
 "Accept":"application/json, text/plain, */*",
 "Origin":"https://www.nba.com",
 "Referer":"https://www.nba.com/",
 "User-Agent":"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36",
 "x-nba-stats-origin":"stats",
 "x-nba-stats-token":"true"
}});
console.log("NBA_STATS_HTTP",r.status,r.headers.get("content-type"));
const text=await r.text();
console.log("NBA_STATS_BODY_HEAD",text.slice(0,1000));
if(!r.ok)throw new Error("NBA stats API failed: "+r.status);
const data=JSON.parse(text);
console.log("NBA_STATS_SETS",JSON.stringify((data.resultSets||[]).map(x=>({name:x.name,headers:x.headers,rows:x.rowSet?.length,first:x.rowSet?.[0]}))));
