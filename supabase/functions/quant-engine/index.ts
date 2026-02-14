import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/* ══════════════════════════════════════════════════════════
   NBA METRIC REGISTRY — market profile weights per model
   ══════════════════════════════════════════════════════════ */

const MARKET_WEIGHTS: Record<string, Record<string, number>> = {
  four_factors:     { moneyline: 0.30, spread: 0.30, total: 0.25, team_total: 0.25, player_prop: 0.05 },
  pace:             { moneyline: 0.10, spread: 0.10, total: 0.25, team_total: 0.20, player_prop: 0.15 },
  efficiency:       { moneyline: 0.30, spread: 0.35, total: 0.15, team_total: 0.20, player_prop: 0.05 },
  log5:             { moneyline: 0.25, spread: 0.10, total: 0.00, team_total: 0.00, player_prop: 0.00 },
  pythag_expectation: { moneyline: 0.15, spread: 0.10, total: 0.00, team_total: 0.00, player_prop: 0.00 },
  net_rating:       { moneyline: 0.20, spread: 0.25, total: 0.10, team_total: 0.15, player_prop: 0.05 },
  game_score:       { moneyline: 0.05, spread: 0.05, total: 0.05, team_total: 0.05, player_prop: 0.20 },
  usage:            { moneyline: 0.00, spread: 0.05, total: 0.10, team_total: 0.10, player_prop: 0.30 },
  ppp:              { moneyline: 0.00, spread: 0.05, total: 0.10, team_total: 0.10, player_prop: 0.20 },
  points_per_shot:  { moneyline: 0.00, spread: 0.00, total: 0.05, team_total: 0.05, player_prop: 0.15 },
  plus_minus:       { moneyline: 0.05, spread: 0.05, total: 0.00, team_total: 0.00, player_prop: 0.10 },
};

/* NBA league baselines (2024-25 season averages) */
const NBA_BASELINES: Record<string, { mean: number; std: number }> = {
  efg:        { mean: 0.534, std: 0.025 },
  tov_rate:   { mean: 0.128, std: 0.015 },
  orb_rate:   { mean: 0.255, std: 0.030 },
  ft_rate:    { mean: 0.195, std: 0.030 },
  pace:       { mean: 100.0, std: 3.5 },
  ortg:       { mean: 113.5, std: 4.5 },
  drtg:       { mean: 113.5, std: 4.5 },
  net_rating: { mean: 0.0,   std: 5.0 },
  game_score: { mean: 10.0,  std: 8.0 },
  usg_rate:   { mean: 20.0,  std: 5.0 },
  ppp:        { mean: 1.05,  std: 0.15 },
  pps:        { mean: 1.20,  std: 0.18 },
  plus_minus: { mean: 0.0,   std: 8.0 },
  win_pct:    { mean: 0.500, std: 0.120 },
};

/* ══════════════════════════════════════════════════════════
   SHARED UTILITIES
   ══════════════════════════════════════════════════════════ */

function estimatePossessions(fga: number, fta: number, orb: number, tov: number): number {
  return fga + 0.44 * fta - orb + tov;
}

function oddsToImpliedProb(odds: number): number {
  if (odds < 0) return Math.abs(odds) / (Math.abs(odds) + 100);
  return 100 / (odds + 100);
}

/** z-score → tanh squash to [-1, 1] */
function normalizeMetric(value: number, baselineKey: string): number {
  const b = NBA_BASELINES[baselineKey];
  if (!b || b.std === 0) return 0;
  const z = (value - b.mean) / b.std;
  return Math.tanh(z);
}

/** Convert raw score to signal object */
function toSignal(score: number): { direction: string; strength: string; score: number } {
  const clamped = Math.max(-1, Math.min(1, score));
  return {
    direction: clamped > 0.15 ? "supports" : clamped < -0.15 ? "conflicts" : "neutral",
    strength: Math.abs(clamped) > 0.5 ? "strong" : Math.abs(clamped) > 0.2 ? "medium" : "weak",
    score: +clamped.toFixed(3),
  };
}

/** Average an array of stat objects over numeric keys */
function avgStats(stats: any[], keys: string[]): any | null {
  if (!stats.length) return null;
  const avg: any = {};
  keys.forEach(k => {
    avg[k] = stats.reduce((s, r) => s + (r[k] || 0), 0) / stats.length;
  });
  avg.minutes = 240; // NBA regulation team minutes
  avg.def_rebounds = (avg.rebounds || 0) - (avg.off_rebounds || 0);
  return avg;
}

const TEAM_STAT_KEYS = [
  "fg_made", "fg_attempted", "three_made", "three_attempted",
  "ft_made", "ft_attempted", "off_rebounds", "def_rebounds",
  "rebounds", "assists", "steals", "blocks", "turnovers", "fouls", "points",
  "pace", "possessions",
];

const PLAYER_STAT_KEYS = [
  "minutes", "points", "fg_made", "fg_attempted", "three_made", "three_attempted",
  "ft_made", "ft_attempted", "off_rebounds", "def_rebounds", "rebounds",
  "assists", "steals", "blocks", "turnovers", "fouls", "plus_minus",
];

/* ══════════════════════════════════════════════════════════
   TEAM MODELS
   ══════════════════════════════════════════════════════════ */

function computeFourFactors(team: any, opp: any, window: string) {
  const fga = team.fg_attempted || 1;
  const fgm = team.fg_made || 0;
  const tpm = team.three_made || 0;
  const fta = team.ft_attempted || 0;
  const ftm = team.ft_made || 0;
  const tov = team.turnovers || 0;
  const orb = team.off_rebounds || 0;
  const oppDrb = opp.def_rebounds || ((opp.rebounds || 0) - (opp.off_rebounds || 0)) || 20;

  const efg = (fgm + 0.5 * tpm) / fga;
  const tovRate = tov / (fga + 0.44 * fta + tov || 1);
  const orbRate = orb / ((orb + oppDrb) || 1);
  const ftRate = ftm / (fga || 1);

  // Composite: weighted z-score blend (Dean Oliver weights: 40/25/20/15)
  const composite = 0.40 * normalizeMetric(efg, "efg")
                   + 0.25 * -normalizeMetric(tovRate, "tov_rate") // lower TOV is better
                   + 0.20 * normalizeMetric(orbRate, "orb_rate")
                   + 0.15 * normalizeMetric(ftRate, "ft_rate");

  return {
    model_id: "four_factors",
    scope: "team",
    metrics: [
      { name: "eFG%", value: +(efg * 100).toFixed(1), unit: "%", window },
      { name: "TOV%", value: +(tovRate * 100).toFixed(1), unit: "%", window },
      { name: "ORB%", value: +(orbRate * 100).toFixed(1), unit: "%", window },
      { name: "FT Rate", value: +(ftRate * 100).toFixed(1), unit: "%", window },
    ],
    signal: toSignal(composite),
    summary: `eFG ${(efg * 100).toFixed(1)}%, TOV ${(tovRate * 100).toFixed(1)}%, ORB ${(orbRate * 100).toFixed(1)}%`,
  };
}

function computeEfficiency(team: any, opp: any, window: string) {
  const teamPoss = estimatePossessions(
    team.fg_attempted || 80, team.ft_attempted || 20,
    team.off_rebounds || 10, team.turnovers || 14
  );
  const oppPoss = estimatePossessions(
    opp.fg_attempted || 80, opp.ft_attempted || 20,
    opp.off_rebounds || 10, opp.turnovers || 14
  );
  const pts = team.points || 100;
  const oppPts = opp.points || 100;

  const ortg = (pts / (teamPoss || 1)) * 100;
  const drtg = (oppPts / (oppPoss || 1)) * 100;
  const net = ortg - drtg;

  const score = normalizeMetric(net, "net_rating");

  return {
    model_id: "efficiency",
    scope: "team",
    metrics: [
      { name: "ORtg", value: +ortg.toFixed(1), window },
      { name: "DRtg", value: +drtg.toFixed(1), window },
      { name: "Net", value: +net.toFixed(1), window },
    ],
    signal: toSignal(score),
    summary: `ORtg ${ortg.toFixed(1)}, DRtg ${drtg.toFixed(1)}, Net ${net > 0 ? "+" : ""}${net.toFixed(1)}`,
  };
}

function computePace(team: any, opp: any, window: string) {
  const teamPoss = estimatePossessions(
    team.fg_attempted || 80, team.ft_attempted || 20,
    team.off_rebounds || 10, team.turnovers || 14
  );
  const oppPoss = estimatePossessions(
    opp.fg_attempted || 80, opp.ft_attempted || 20,
    opp.off_rebounds || 10, opp.turnovers || 14
  );
  const teamMin = team.minutes || 240;
  const pace = 48 * ((teamPoss + oppPoss) / 2) / (teamMin / 5);
  const score = normalizeMetric(pace, "pace");

  return {
    model_id: "pace",
    scope: "team",
    metrics: [
      { name: "Pace", value: +pace.toFixed(1), unit: "poss/game", window },
      { name: "vs League Avg", value: +(pace - NBA_BASELINES.pace.mean).toFixed(1), window },
    ],
    signal: { ...toSignal(score), direction: "neutral" as string }, // pace isn't inherently good/bad
    summary: `Pace ${pace.toFixed(1)} (${pace > NBA_BASELINES.pace.mean ? "+" : ""}${(pace - NBA_BASELINES.pace.mean).toFixed(1)} vs avg)`,
  };
}

function computeNetRating(seasonStats: any) {
  if (!seasonStats) return null;
  const net = seasonStats.net_rating ?? ((seasonStats.off_rating ?? 0) - (seasonStats.def_rating ?? 0));
  const score = normalizeMetric(net, "net_rating");

  return {
    model_id: "net_rating",
    scope: "team",
    metrics: [
      { name: "Net Rating", value: +net.toFixed(1), window: "season" },
      { name: "ORtg", value: +(seasonStats.off_rating || 0).toFixed(1), window: "season" },
      { name: "DRtg", value: +(seasonStats.def_rating || 0).toFixed(1), window: "season" },
    ],
    signal: toSignal(score),
    summary: `Season Net Rating: ${net > 0 ? "+" : ""}${net.toFixed(1)}`,
  };
}

/* ══════════════════════════════════════════════════════════
   MATCHUP MODELS
   ══════════════════════════════════════════════════════════ */

function computeLog5(homeWinPct: number, awayWinPct: number) {
  const pA = Math.max(0.01, Math.min(0.99, homeWinPct));
  const pB = Math.max(0.01, Math.min(0.99, awayWinPct));
  const prob = (pA - pA * pB) / (pA + pB - 2 * pA * pB);
  const score = normalizeMetric(prob, "win_pct");

  return {
    model_id: "log5",
    scope: "team",
    metrics: [
      { name: "Home Win Prob", value: +(prob * 100).toFixed(1), unit: "%" },
      { name: "Home Win%", value: +(pA * 100).toFixed(1), unit: "%" },
      { name: "Away Win%", value: +(pB * 100).toFixed(1), unit: "%" },
    ],
    signal: toSignal(score),
    summary: `Log5 Home Win Prob: ${(prob * 100).toFixed(1)}%`,
  };
}

function computePythag(wins: number, losses: number, ptsFor: number, ptsAgainst: number) {
  const exp = 13.91; // NBA Pythagorean exponent
  const pf = ptsFor || 1;
  const pa = ptsAgainst || 1;
  const pyth = Math.pow(pf, exp) / (Math.pow(pf, exp) + Math.pow(pa, exp));
  const actualWinPct = wins / ((wins + losses) || 1);
  const luck = actualWinPct - pyth; // positive = overperforming (due for regression)

  return {
    model_id: "pythag_expectation",
    scope: "team",
    metrics: [
      { name: "Pythag Win%", value: +(pyth * 100).toFixed(1), unit: "%" },
      { name: "Actual Win%", value: +(actualWinPct * 100).toFixed(1), unit: "%" },
      { name: "Luck Factor", value: +(luck * 100).toFixed(1), unit: "%" },
    ],
    signal: toSignal(-luck * 5), // overperformers regress → fade signal
    summary: `Pythag ${(pyth * 100).toFixed(1)}% vs Actual ${(actualWinPct * 100).toFixed(1)}% (Luck: ${luck > 0 ? "+" : ""}${(luck * 100).toFixed(1)}%)`,
  };
}

/* ══════════════════════════════════════════════════════════
   PLAYER MODELS
   ══════════════════════════════════════════════════════════ */

function computeGameScoreAvg(games: any[], window: string) {
  const scores = games.map(p => {
    const drb = (p.def_rebounds ?? ((p.rebounds || 0) - (p.off_rebounds || 0)));
    return (p.points || 0)
      + 0.4 * (p.fg_made || 0)
      - 0.7 * (p.fg_attempted || 0)
      - 0.4 * ((p.ft_attempted || 0) - (p.ft_made || 0))
      + 0.7 * (p.off_rebounds || 0)
      + 0.3 * drb
      + (p.steals || 0)
      + 0.7 * (p.assists || 0)
      + 0.7 * (p.blocks || 0)
      - 0.4 * (p.fouls || 0)
      - (p.turnovers || 0);
  });

  const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
  const latest = scores[0];

  return {
    model_id: "game_score",
    scope: "player",
    metrics: [
      { name: "Game Score (avg)", value: +avg.toFixed(1), window },
      { name: "Last Game", value: +latest.toFixed(1) },
      { name: "PTS (avg)", value: +(games.reduce((s, p) => s + (p.points || 0), 0) / games.length).toFixed(1), window },
    ],
    signal: toSignal(normalizeMetric(avg, "game_score")),
    summary: `GmSc avg ${avg.toFixed(1)} (last: ${latest.toFixed(1)})`,
  };
}

function computeUsageAvg(games: any[], teamStatsByGame: Map<string, any>, window: string) {
  const usages: number[] = [];
  for (const p of games) {
    if (!p.minutes || p.minutes < 5) continue;
    const teamTotals = teamStatsByGame.get(p.game_id);
    if (!teamTotals) continue;
    const teamMin = teamTotals.minutes || 240;
    const teamFga = teamTotals.fg_attempted || 80;
    const teamFta = teamTotals.ft_attempted || 20;
    const teamTov = teamTotals.turnovers || 14;
    const num = ((p.fg_attempted || 0) + 0.44 * (p.ft_attempted || 0) + (p.turnovers || 0)) * (teamMin / 5);
    const den = p.minutes * (teamFga + 0.44 * teamFta + teamTov);
    if (den > 0) usages.push(100 * num / den);
  }

  if (!usages.length) return null;
  const avg = usages.reduce((a, b) => a + b, 0) / usages.length;
  const avgMin = games.reduce((s, p) => s + (p.minutes || 0), 0) / games.length;

  return {
    model_id: "usage",
    scope: "player",
    metrics: [
      { name: "USG%", value: +avg.toFixed(1), unit: "%", window },
      { name: "Avg Minutes", value: +avgMin.toFixed(1), unit: "min", window },
    ],
    signal: toSignal(normalizeMetric(avg, "usg_rate")),
    summary: `USG% ${avg.toFixed(1)}% in ${avgMin.toFixed(0)} min`,
  };
}

function computePPPAvg(games: any[], window: string) {
  const vals: number[] = [];
  for (const p of games) {
    const possUsed = (p.fg_attempted || 0) + 0.44 * (p.ft_attempted || 0) + (p.turnovers || 0);
    if (possUsed > 0) vals.push((p.points || 0) / possUsed);
  }
  if (!vals.length) return null;
  const avg = vals.reduce((a, b) => a + b, 0) / vals.length;

  return {
    model_id: "ppp",
    scope: "player",
    metrics: [
      { name: "PPP", value: +avg.toFixed(3), window },
    ],
    signal: toSignal(normalizeMetric(avg, "ppp")),
    summary: `Points/Possession: ${avg.toFixed(2)}`,
  };
}

function computePPSAvg(games: any[], window: string) {
  const vals: number[] = [];
  for (const p of games) {
    if ((p.fg_attempted || 0) > 0) vals.push((p.points || 0) / p.fg_attempted);
  }
  if (!vals.length) return null;
  const avg = vals.reduce((a, b) => a + b, 0) / vals.length;

  return {
    model_id: "points_per_shot",
    scope: "player",
    metrics: [
      { name: "PPS", value: +avg.toFixed(3), window },
    ],
    signal: toSignal(normalizeMetric(avg, "pps")),
    summary: `Points/Shot: ${avg.toFixed(2)}`,
  };
}

function computePlusMinusAvg(games: any[], window: string) {
  const vals = games.map(p => p.plus_minus ?? 0);
  const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
  const latest = vals[0];

  return {
    model_id: "plus_minus",
    scope: "player",
    metrics: [
      { name: "+/- (avg)", value: +avg.toFixed(1), window },
      { name: "Last Game", value: latest },
    ],
    signal: toSignal(normalizeMetric(avg, "plus_minus")),
    summary: `+/- avg ${avg > 0 ? "+" : ""}${avg.toFixed(1)} (last: ${latest > 0 ? "+" : ""}${latest})`,
  };
}

/* ══════════════════════════════════════════════════════════
   MARKET-WEIGHTED AGGREGATION
   ══════════════════════════════════════════════════════════ */

function aggregateQuant(
  models: any[],
  marketType: string,
  marketSnapshot: any,
) {
  if (!models.length) return { quant_score: 0, edge_assessment: "no_edge" as const, notes: "Insufficient data" };

  const profile = marketType || "moneyline";

  // Weighted aggregate using market profile
  let weightedSum = 0;
  let totalWeight = 0;
  for (const m of models) {
    const w = MARKET_WEIGHTS[m.model_id]?.[profile] ?? 0.05;
    weightedSum += (m.signal?.score || 0) * w;
    totalWeight += w;
  }

  const quantScore = totalWeight > 0 ? Math.max(-1, Math.min(1, weightedSum / totalWeight)) : 0;

  // Edge detection vs market implied probability
  let edgeAssessment = "no_edge";
  if (marketSnapshot?.implied_prob && profile !== "player_prop") {
    // Convert quant score to a probability-like value
    const modelProb = 0.5 + quantScore * 0.25; // maps [-1,1] → [0.25, 0.75]
    const edge = Math.abs(modelProb - marketSnapshot.implied_prob);
    if (edge > 0.08) edgeAssessment = "clear_edge";
    else if (edge > 0.03) edgeAssessment = "thin_edge";
  } else {
    // Fallback: use raw score magnitude
    if (Math.abs(quantScore) > 0.4) edgeAssessment = "clear_edge";
    else if (Math.abs(quantScore) > 0.2) edgeAssessment = "thin_edge";
  }

  const supportCount = models.filter(m => m.signal?.direction === "supports").length;
  const conflictCount = models.filter(m => m.signal?.direction === "conflicts").length;
  const neutralCount = models.filter(m => m.signal?.direction === "neutral").length;

  return {
    quant_score: +quantScore.toFixed(3),
    edge_assessment: edgeAssessment,
    notes: `${supportCount} support, ${conflictCount} conflict, ${neutralCount} neutral (weighted ${profile}: ${quantScore > 0 ? "+" : ""}${quantScore.toFixed(2)})`,
  };
}

/* ══════════════════════════════════════════════════════════
   ASTRO VERDICT ENGINE (5-layer)
   ══════════════════════════════════════════════════════════ */
const ZS = ["Aries","Taurus","Gemini","Cancer","Leo","Virgo","Libra","Scorpio","Sagittarius","Capricorn","Aquarius","Pisces"];
const TR: Record<string,string> = {Aries:"Mars",Taurus:"Venus",Gemini:"Mercury",Cancer:"Moon",Leo:"Sun",Virgo:"Mercury",Libra:"Venus",Scorpio:"Mars",Sagittarius:"Jupiter",Capricorn:"Saturn",Aquarius:"Saturn",Pisces:"Jupiter"};
const EX: Record<string,string> = {Aries:"Sun",Taurus:"Moon",Cancer:"Jupiter",Virgo:"Mercury",Libra:"Saturn",Capricorn:"Mars",Pisces:"Venus"};
const DT: Record<string,string> = {Aries:"Venus",Taurus:"Mars",Gemini:"Jupiter",Cancer:"Saturn",Leo:"Saturn",Virgo:"Jupiter",Libra:"Mars",Scorpio:"Venus",Sagittarius:"Mercury",Capricorn:"Moon",Aquarius:"Sun",Pisces:"Mercury"};
const FL: Record<string,string> = {Aries:"Saturn",Cancer:"Mars",Virgo:"Venus",Libra:"Sun",Scorpio:"Moon",Capricorn:"Jupiter",Pisces:"Mercury"};
function edig(p:string,s:string){if(TR[s]===p)return"Domicile";if(EX[s]===p)return"Exaltation";if(DT[s]===p)return"Detriment";if(FL[s]===p)return"Fall";return"Peregrine";}
function dsc(d:string){return d==="Domicile"?5:d==="Exaltation"?4:d==="Detriment"?-4:d==="Fall"?-5:0;}
function jd(y:number,m:number,d:number,h:number){if(m<=2){y--;m+=12;}const A=Math.floor(y/100);return Math.floor(365.25*(y+4716))+Math.floor(30.6001*(m+1))+d+h/24+2-A+Math.floor(A/4)-1524.5;}
function gm(j:number){const T=(j-2451545)/36525;return((280.46061837+360.98564736629*(j-2451545)+.000387933*T*T)%360+360)%360;}
function pp(j:number){const T=(j-2451545)/36525;return[{n:"Sun",L:280.4664567,r:360.0076983},{n:"Moon",L:218.3164591,r:4812.6788232},{n:"Mercury",L:252.250906,r:1494.5786224},{n:"Venus",L:181.979801,r:585.1782884},{n:"Mars",L:355.433275,r:191.4025028},{n:"Jupiter",L:34.351519,r:30.3490553},{n:"Saturn",L:50.077444,r:12.2116686}].map(p=>{let l=((p.L+p.r*T)%360+360)%360;return{planet:p.n,longitude:Math.round(l*100)/100,sign:ZS[Math.floor(l/30)],degree:Math.round((l%30)*10)/10};});}
const AD=[{n:"Conjunction",a:0,o:8},{n:"Sextile",a:60,o:6},{n:"Square",a:90,o:7},{n:"Trine",a:120,o:7},{n:"Opposition",a:180,o:8}];
function fa(pos:any[]){const r:any[]=[];for(let i=0;i<pos.length;i++)for(let j=i+1;j<pos.length;j++){let d=Math.abs(pos[i].longitude-pos[j].longitude);if(d>180)d=360-d;for(const a of AD){const o=Math.abs(d-a.a);if(o<=a.o)r.push({planet1:pos[i].planet,planet2:pos[j].planet,type:a.n,orb:Math.round(o*10)/10,applying:pos[i].longitude<pos[j].longitude});}}return r;}
function ascS(l:number,lat:number){const o=23.4393*Math.PI/180;const r=Math.atan2(-Math.cos(l*Math.PI/180),Math.sin(l*Math.PI/180)*Math.cos(o)+Math.tan(lat*Math.PI/180)*Math.sin(o));const d=((r*180/Math.PI)+360)%360;return{sign:ZS[Math.floor(d/30)],degree:Math.round((d%30)*10)/10};}
const CH=["Saturn","Jupiter","Mars","Sun","Venus","Mercury","Moon"];
const DR=["Sun","Moon","Mars","Mercury","Jupiter","Venus","Saturn"];

async function handleAstroVerdict(sb:any,gameId:string,forceRefresh:boolean){
  if(!forceRefresh){const{data:c}=await sb.from("astro_calculations").select("result").eq("entity_id",gameId).eq("calc_type","astro_verdict").gt("expires_at",new Date().toISOString()).maybeSingle();if(c)return new Response(JSON.stringify({success:true,cached:true,verdict:c.result}),{headers:{...corsHeaders,"Content-Type":"application/json"}});}
  const{data:game}=await sb.from("games").select("*").eq("id",gameId).single();
  if(!game)throw new Error("Game not found");
  const gd=new Date(game.start_time);
  const J=jd(gd.getFullYear(),gd.getMonth()+1,gd.getDate(),gd.getUTCHours()+gd.getUTCMinutes()/60);
  const vLat=game.venue_lat||40.7,vLng=game.venue_lng||-74;
  const pos=pp(J),asp=fa(pos);
  const l=((gm(J)+vLng)%360+360)%360;
  const asc=ascS(l,vLat);
  const desc=ZS[(ZS.indexOf(asc.sign)+6)%12];
  // Planetary hour
  const dayR=DR[gd.getUTCDay()],si=CH.indexOf(dayR);
  const hd=((gd.getUTCHours()+gd.getUTCMinutes()/60+vLng/15)%24+24)%24;
  const hn=hd>=6&&hd<18?Math.floor(hd-6):(hd>=18?Math.floor(hd-18)+12:Math.floor(hd+6)+12);
  const pHour={planet:CH[(si+(hn%24))%7],hourNumber:(hn%24)+1};
  // Moon
  const moonG=pos.find(p=>p.planet==="Moon")!;
  const prePos=pp(J-2/24),postPos=pp(J+3/24);
  const preA=fa(prePos).filter((a:any)=>a.planet1==="Moon"||a.planet2==="Moon");
  const gameA=fa(pos).filter((a:any)=>a.planet1==="Moon"||a.planet2==="Moon");
  const postA=fa(postPos).filter((a:any)=>a.planet1==="Moon"||a.planet2==="Moon");
  const lastAsp=preA.length?preA.reduce((a:any,b:any)=>a.orb<b.orb?a:b):null;
  const appl=[...gameA,...postA].filter((a:any)=>a.applying);
  const nextAsp=appl.length?appl.reduce((a:any,b:any)=>a.orb<b.orb?a:b):null;
  const voc=appl.length===0&&((ZS.indexOf(moonG.sign)+1)*30-moonG.longitude)<13;
  const moon={lastAspect:lastAsp,nextAspect:nextAsp,moonSign:moonG.sign,moonDegree:moonG.degree,voidOfCourse:voc};
  // Fetch teams + players
  const[taR,plR]=await Promise.all([sb.from("team_astro").select("*").in("team_abbr",[game.home_abbr,game.away_abbr]),sb.from("players").select("id,name,team,birth_date").in("team",[game.home_abbr,game.away_abbr]).not("birth_date","is",null).limit(40)]);
  const hTA=taR.data?.find((t:any)=>t.team_abbr===game.home_abbr);
  const aTA=taR.data?.find((t:any)=>t.team_abbr===game.away_abbr);
  const players=plR.data||[];
  // L1: HORARY
  const hL=TR[asc.sign]||"Mercury",aL=TR[desc]||"Jupiter";
  const hLP=pos.find(p=>p.planet===hL),aLP=pos.find(p=>p.planet===aL);
  const hD=hLP?edig(hL,hLP.sign):"Peregrine",aD=aLP?edig(aL,aLP.sign):"Peregrine";
  let hSc=dsc(hD),aSc=dsc(aD);
  if(nextAsp){const t=nextAsp.planet1==="Moon"?nextAsp.planet2:nextAsp.planet1;if(t===hL)hSc+=2;else if(t===aL)aSc+=2;}
  const hDiff=hSc-aSc;
  const horary={layer:"horary",homeLean:Math.max(-1,Math.min(1,hDiff/10)),confidence:Math.min(1,Math.abs(hDiff)/6),
    narrative:`ASC ${asc.sign} (${hL} in ${hD}) vs DSC ${desc} (${aL} in ${aD}).${voc?" ⚠️ Moon VOC.":""}`,
    details:{ascSign:asc.sign,descSign:desc,homeLord:hL,awayLord:aL,homeDignity:hD,awayDignity:aD}};
  // L2: ASTROCARTOGRAPHY
  const gmV=gm(J);const carto:any[]=[];
  for(const p of pos){const mc=p.longitude-gmV;for(const[t,d]of[["MC",Math.abs(((vLng-mc+180)%360)-180)],["IC",Math.abs(((vLng-(mc+180))%360+180)%360-180)],["ASC",Math.abs(((vLng-(mc-90))%360+180)%360-180)],["DSC",Math.abs(((vLng-(mc+90))%360+180)%360-180)]]as any){const inf=d<3?"strong":d<8?"moderate":d<15?"weak":"none";if(inf!=="none")carto.push({planet:p.planet,lineType:t,dist:Math.round(d*10)/10,influence:inf,nature:["Jupiter","Venus","Sun"].includes(p.planet)?"benefic":["Saturn","Mars"].includes(p.planet)?"malefic":"neutral"});}}
  carto.sort((a:any,b:any)=>a.dist-b.dist);
  const bL=carto.filter((c:any)=>c.nature==="benefic"&&(c.influence==="strong"||c.influence==="moderate"));
  const mL=carto.filter((c:any)=>c.nature==="malefic"&&(c.influence==="strong"||c.influence==="moderate"));
  const astrocarto={layer:"astrocartography",homeLean:Math.max(-1,Math.min(1,bL.length*.3-mL.length*.3)),confidence:Math.min(1,(bL.length+mL.length)*.2),
    narrative:`Benefic: ${bL.map((l:any)=>`${l.planet} ${l.lineType} ${l.dist}°`).join(", ")||"none"}. Malefic: ${mL.map((l:any)=>`${l.planet} ${l.lineType} ${l.dist}°`).join(", ")||"none"}.`};
  // L3: TEAM ZODIAC
  let tLean=0,tNarr="No team astro data.";
  if(hTA&&aTA){const hr=pos.find(p=>p.planet===hTA.ruling_planet),ar=pos.find(p=>p.planet===aTA.ruling_planet);
    tLean=(hr?dsc(edig(hr.planet,hr.sign)):0)/5-(ar?dsc(edig(ar.planet,ar.sign)):0)/5;
    tNarr=`${game.home_abbr}(${hTA.mascot_sign}/${hTA.element}) vs ${game.away_abbr}(${aTA.mascot_sign}/${aTA.element}). Home ruler ${hTA.ruling_planet}, Away ruler ${aTA.ruling_planet}.`;}
  const teamZ={layer:"team_zodiac",homeLean:Math.max(-1,Math.min(1,tLean)),confidence:hTA&&aTA?.6:.1,narrative:tNarr};
  // L4: PLAYER TRANSITS
  function ptScore(tpl:any[]){let tot=0;const k:string[]=[];const tp=tpl.slice(0,8);
    for(const pl of tp){const bd=new Date(pl.birth_date);const nJ=jd(bd.getFullYear(),bd.getMonth()+1,bd.getDate(),12);const nP=pp(nJ);const nS=nP.find(p=>p.planet==="Sun");if(!nS)continue;
      for(const tr of pos){let d=Math.abs(tr.longitude-nS.longitude);if(d>180)d=360-d;for(const a of AD){if(Math.abs(d-a.a)<=3){const hard=a.n==="Square"||a.n==="Opposition";const ben=["Jupiter","Venus","Sun"].includes(tr.planet);
        if(!hard&&ben){tot+=2;k.push(`${pl.name}: ${tr.planet} ${a.n} ☉↑`);}else if(hard&&!ben){tot-=2;k.push(`${pl.name}: ${tr.planet} ${a.n} ☉↓`);}else if(!hard)tot+=1;else tot-=1;break;}}}}
    return{score:tp.length?tot/tp.length:0,analyzed:tp.length,key:k.slice(0,4)};}
  const hPl=players.filter((p:any)=>p.team===game.home_abbr),aPl=players.filter((p:any)=>p.team===game.away_abbr);
  const hT=ptScore(hPl),aT=ptScore(aPl);
  const playerTr={layer:"player_transits",homeLean:Math.max(-1,Math.min(1,(hT.score-aT.score)/4)),confidence:Math.min(1,(hT.analyzed+aT.analyzed)/10),
    narrative:`${game.home_abbr}: ${hT.analyzed}p avg ${hT.score.toFixed(2)}. ${game.away_abbr}: ${aT.analyzed}p avg ${aT.score.toFixed(2)}.${hT.key.length?` ${hT.key.join("; ")}`:""}`};
  // L5: VENUE ANGULAR
  const ascD=ZS.indexOf(asc.sign)*30+asc.degree;const oR=23.4393*Math.PI/180;
  const mcR=Math.atan2(Math.sin(l*Math.PI/180),Math.cos(l*Math.PI/180)*Math.cos(oR));const mcD=((mcR*180/Math.PI)+360)%360;
  const angs=[{n:"ASC",d:ascD},{n:"MC",d:mcD},{n:"DSC",d:(ascD+180)%360},{n:"IC",d:(mcD+180)%360}];
  const angular:any[]=[];for(const p of pos)for(const a of angs){let df=Math.abs(p.longitude-a.d);if(df>180)df=360-df;if(df<=10)angular.push({planet:p.planet,angle:a.n,orb:Math.round(df*10)/10,dignity:edig(p.planet,p.sign),nature:["Jupiter","Venus","Sun"].includes(p.planet)?"benefic":["Saturn","Mars"].includes(p.planet)?"malefic":"neutral"});}
  angular.sort((a:any,b:any)=>a.orb-b.orb);
  const bA=angular.filter((a:any)=>a.nature==="benefic"),mA=angular.filter((a:any)=>a.nature==="malefic");
  const venueA={layer:"venue_angular",homeLean:Math.max(-1,Math.min(1,bA.length*.25-mA.length*.25)),confidence:Math.min(1,angular.length*.15),
    narrative:`Angular: ${angular.map((a:any)=>`${a.planet}@${a.angle}(${a.orb}°,${a.dignity})`).join(", ")||"none"}.`};
  // BLEND
  const LW:{[k:string]:number}={horary:.25,astrocartography:.25,team_zodiac:.15,player_transits:.20,venue_angular:.15};
  const layers={horary,astrocartography:astrocarto,team_zodiac:teamZ,player_transits:playerTr,venue_angular:venueA};
  let ws=0,wt=0;for(const[k,ly]of Object.entries(layers)){const w=LW[k]||.1;ws+=(ly as any).homeLean*(ly as any).confidence*w;wt+=w;}
  const blend=wt>0?Math.round(ws/wt*1000)/1000:0;
  const fav=Math.abs(blend)<.05?"neutral":blend>0?"home":"away";
  const str=Math.abs(blend)>.5?"strong":Math.abs(blend)>.2?"moderate":"slight";
  const fN=fav==="home"?game.home_abbr:fav==="away"?game.away_abbr:"Neither";
  const verdict={game_id:gameId,date:game.start_time.slice(0,10),home_team:game.home_abbr,away_team:game.away_abbr,venue:game.venue,
    layers,moon,planetary_hour:pHour,positions:pos,aspects:asp.slice(0,15),angular_planets:angular.slice(0,10),carto_lines:carto.slice(0,12),
    blended_score:blend,favored_team:fav,strength:str,
    narrative:`${str.toUpperCase()} ${fav==="neutral"?"neutral":`${fN} lean`} (${blend}). Moon ${moon.moonSign} ${moon.moonDegree}°${voc?" VOC":""}${lastAsp?`, last ${lastAsp.type} ${lastAsp.planet1==="Moon"?lastAsp.planet2:lastAsp.planet1}`:""}${nextAsp?`, next ${nextAsp.type} ${nextAsp.planet1==="Moon"?nextAsp.planet2:nextAsp.planet1}`:""}.`};
  await sb.from("astro_calculations").upsert({entity_id:gameId,entity_type:"game",calc_type:"astro_verdict",calc_date:game.start_time.slice(0,10),provider:"internal",result:verdict as any,location_lat:vLat,location_lng:vLng,expires_at:new Date(Date.now()+6*3600000).toISOString()},{onConflict:"entity_id,entity_type,calc_type,calc_date"});
  return new Response(JSON.stringify({success:true,verdict}),{headers:{...corsHeaders,"Content-Type":"application/json"}});
}

/* ══════════════════════════════════════════════════════════
   MAIN HANDLER
   ══════════════════════════════════════════════════════════ */

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, serviceKey);

    const body = await req.json();
    const {
      game_id,
      player_id,
      market_type = "moneyline",
      force_refresh = false,
      window_size = 5,
      mode = "quant", // "quant" | "astro_verdict"
    } = body;

    if (!game_id) throw new Error("game_id is required");

    // ══════════════════════════════════════════════════════════
    // ASTRO VERDICT MODE
    // ══════════════════════════════════════════════════════════
    if (mode === "astro_verdict") {
      return await handleAstroVerdict(sb, game_id, force_refresh);
    }

    // ── Cache check ──
    if (!force_refresh) {
      const { data: cached } = await sb
        .from("quant_cache")
        .select("*")
        .eq("game_id", game_id)
        .eq("entity_type", player_id ? "player" : "game")
        .eq("entity_id", player_id || "_game")
        .gte("expires_at", new Date().toISOString())
        .maybeSingle();

      if (cached) {
        return new Response(JSON.stringify({
          success: true,
          cached: true,
          quant: {
            market_snapshot: cached.market_snapshot,
            models: cached.models,
            verdict: cached.verdict,
          },
          signals: cached.signals,
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    // ── Fetch game ──
    const { data: game } = await sb.from("games").select("*").eq("id", game_id).single();
    if (!game) throw new Error("Game not found");

    const window = `last_${window_size}`;
    const models: any[] = [];
    let marketSnapshot: any = { market_type: market_type };

    // ── Fetch odds ──
    const { data: odds } = await sb
      .from("odds_snapshots")
      .select("*")
      .eq("game_id", game_id)
      .order("captured_at", { ascending: false })
      .limit(10);

    // Also check sdio_game_lines
    const { data: sdioLines } = await sb
      .from("sdio_game_lines")
      .select("*")
      .eq("game_id", game_id)
      .order("captured_at", { ascending: false })
      .limit(10);

    // Build market snapshot from best available source
    const ml = odds?.find(o => o.market_type === "moneyline") ||
               sdioLines?.find(o => o.market_type === "moneyline");
    const spreadOdds = odds?.find(o => o.market_type === "spread") ||
                       sdioLines?.find(o => o.market_type === "spread");
    const totalOdds = odds?.find(o => o.market_type === "total") ||
                      sdioLines?.find(o => o.market_type === "total");

    if (ml) {
      const homeOdds = ml.home_price || -110;
      marketSnapshot = {
        market_type: market_type,
        line: ml.line ?? spreadOdds?.home_line,
        odds_american: homeOdds,
        implied_prob: +oddsToImpliedProb(homeOdds).toFixed(3),
      };
    }

    // ── Fetch team game stats (recent N for each team) ──
    const fetchRecentTeamStats = async (abbr: string) => {
      const { data } = await sb
        .from("team_game_stats")
        .select("*")
        .eq("team_abbr", abbr)
        .order("created_at", { ascending: false })
        .limit(window_size);
      return data || [];
    };

    const [homeStats, awayStats] = await Promise.all([
      fetchRecentTeamStats(game.home_abbr),
      fetchRecentTeamStats(game.away_abbr),
    ]);

    const homeAvg = avgStats(homeStats, TEAM_STAT_KEYS);
    const awayAvg = avgStats(awayStats, TEAM_STAT_KEYS);

    // ── Team models ──
    if (homeAvg && awayAvg) {
      models.push(computeFourFactors(homeAvg, awayAvg, window));
      models.push(computeEfficiency(homeAvg, awayAvg, window));
      models.push(computePace(homeAvg, awayAvg, window));
    }

    // Season stats for net rating
    const fetchSeasonStats = async (abbr: string) => {
      const { data } = await sb
        .from("team_season_stats")
        .select("*")
        .eq("team_abbr", abbr)
        .eq("league", game.league)
        .order("season", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    };

    const [homeSeasonStats, awaySeasonStats] = await Promise.all([
      fetchSeasonStats(game.home_abbr),
      fetchSeasonStats(game.away_abbr),
    ]);

    if (homeSeasonStats) {
      const nr = computeNetRating(homeSeasonStats);
      if (nr) models.push(nr);
    }

    // ── Matchup models (standings) ──
    const { data: standings } = await sb
      .from("standings")
      .select("*")
      .in("team_abbr", [game.home_abbr, game.away_abbr])
      .eq("league", game.league)
      .order("season", { ascending: false })
      .limit(4);

    const homeStanding = standings?.find(s => s.team_abbr === game.home_abbr);
    const awayStanding = standings?.find(s => s.team_abbr === game.away_abbr);

    if (homeStanding && awayStanding) {
      const homeWinPct = homeStanding.win_pct ?? (homeStanding.wins / ((homeStanding.wins + homeStanding.losses) || 1));
      const awayWinPct = awayStanding.win_pct ?? (awayStanding.wins / ((awayStanding.wins + awayStanding.losses) || 1));
      models.push(computeLog5(homeWinPct, awayWinPct));

      if (homeStanding.points_for && homeStanding.points_against) {
        models.push(computePythag(
          homeStanding.wins, homeStanding.losses,
          homeStanding.points_for, homeStanding.points_against
        ));
      }
    }

    // ── Player models ──
    if (player_id) {
      const { data: playerStats } = await sb
        .from("player_game_stats")
        .select("*")
        .eq("player_id", player_id)
        .order("created_at", { ascending: false })
        .limit(window_size);

      if (playerStats?.length) {
        // Build team stats lookup per game for usage calculation
        const gameIds = [...new Set(playerStats.map(p => p.game_id))];
        const teamAbbr = playerStats[0].team_abbr;
        const { data: teamStatsForGames } = await sb
          .from("team_game_stats")
          .select("*")
          .in("game_id", gameIds)
          .eq("team_abbr", teamAbbr);

        const teamStatsByGame = new Map<string, any>();
        (teamStatsForGames || []).forEach(t => teamStatsByGame.set(t.game_id, t));

        // Compute all player models
        models.push(computeGameScoreAvg(playerStats, window));
        models.push(computePlusMinusAvg(playerStats, window));

        const usg = computeUsageAvg(playerStats, teamStatsByGame, window);
        if (usg) models.push(usg);

        const ppp = computePPPAvg(playerStats, window);
        if (ppp) models.push(ppp);

        const pps = computePPSAvg(playerStats, window);
        if (pps) models.push(pps);
      }
    }

    // ── Aggregate verdict ──
    const effectiveMarket = player_id ? "player_prop" : market_type;
    const verdict = aggregateQuant(models, effectiveMarket, marketSnapshot);

    const quantLean = verdict.quant_score > 0.15 ? "support" : verdict.quant_score < -0.15 ? "fade" : "neutral";
    const signals = {
      quant: { lean: quantLean, edge: verdict.edge_assessment },
    };

    // ── Cache ──
    await sb.from("quant_cache").upsert({
      game_id,
      entity_type: player_id ? "player" : "game",
      entity_id: player_id || "_game",
      models,
      verdict,
      market_snapshot: marketSnapshot,
      signals,
      computed_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
    }, { onConflict: "game_id,entity_type,entity_id" });

    return new Response(JSON.stringify({
      success: true,
      cached: false,
      league: game.league,
      window,
      quant: { market_snapshot: marketSnapshot, models, verdict },
      signals,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (error) {
    console.error("quant-engine error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
