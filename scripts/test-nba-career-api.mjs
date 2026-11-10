for(const [league,id] of [["nba","1966"],["mens-college-basketball","4873090"]]){
 const url="https://site.web.api.espn.com/apis/common/v3/sports/basketball/"+league+"/athletes/"+id+"/gamelog?season=2026";
 const r=await fetch(url,{headers:{"Accept":"application/json","User-Agent":"BasketballManager-HiddenScout/1.0"},signal:AbortSignal.timeout(15000)});
 const d=await r.json();
 console.log("GLOG",league,r.status,JSON.stringify({eventCount:Object.keys(d.events||{}).length,labels:d.labels,types:(d.seasonTypes||[]).map(st=>({name:st.displayName,cats:(st.categories||[]).map(c=>({name:c.displayName,type:c.type,games:c.events?.length,totals:c.totals}))}))}));
}
