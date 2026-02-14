/* ============================================================================
SPORTSGAMEODDS.COM — MASTER INTEGRATION TYPES
Includes RAW API MODEL, NORMALIZED APP MODEL, and ADAPTER functions.
Built from SGO v2 API documentation.
=========================================================================== */

/* =========================
   0) Shared helpers
========================= */

export type ISODateTimeString = string;
export type IdMap<T> = Record<string, T>;

/* =========================
   1) RAW ENUMS
========================= */

export type RawBroadcastType = "tv" | "webstream" | "subscription" | "sportsbook";
export type RawPropType = "game_prop" | "team_prop" | "player_prop" | "other_prop";
export type RawPlayerStatus =
  | "ir" | "active" | "out" | "suspended"
  | "questionable" | "doubtful" | "probable";

/* =========================
   2) RAW: Sport / League / Team / Player / Stat
========================= */

export interface RawSport {
  sportID: string;
  enabled: boolean;
  hasMeaningfulHomeAway: boolean;
  name: string;
  shortName: string;
  pointWord: Record<string, unknown>;
  eventWord: Record<string, unknown>;
  imageIcon: string;
  squareImage: string;
  backgroundImage: string;
  defaultPopularityScore: number;
  clockType: string;
  basePeriods: string[];
  extraPeriods: string[];
}

export interface RawLeague {
  sportID: string;
  leagueID: string;
  enabled: boolean;
  name: string;
  shortName: string;
}

export interface RawVenue {
  name: string;
  countryName: string;
  countryCode: string;
  regionName: string;
  regionCode: string;
  city: string;
  address: string;
  capacity: number;
}

export interface RawReferee { name: string; }

export interface RawBroadcast {
  broadcasterID: string;
  name: string;
  type: RawBroadcastType;
}

export interface RawTeamColors {
  primaryContrast: string;
  primary: string;
  secondary: string;
  secondaryContrast: string;
}

export interface RawTeamNames {
  short: string;
  medium: string;
  long: string;
}

export interface RawStandings {
  position: string;
  wins: number;
  losses: number;
  ties: number;
  record: string;
  played: number;
  last5: string;
}

export interface RawTeamLookups { teamName: string[]; }
export interface RawCoach { name: string; }
export interface RawOwner { name: string; }

export interface RawTeam {
  sportID: string;
  leagueID: string;
  teamID: string;
  logo: string;
  names: RawTeamNames;
  colors: RawTeamColors;
  standings: RawStandings;
  lookups: RawTeamLookups;
  coach: RawCoach;
  owner: RawOwner;
  venue: RawVenue;
}

export interface RawTeamOverview {
  statEntityID: string;
  score: number;
  names: RawTeamNames;
  teamID: string;
  logo: string;
  colors: RawTeamColors;
}

export interface RawPlayerNames {
  display: string;
  firstName: string;
  lastName: string;
}

export interface RawPlayerLookups {
  fullName: string[];
  anyName: string[];
  initials: string[];
}

export interface RawPlayer {
  sportID: string;
  leagueID: string;
  jerseyNumber: number;
  position: string;
  playerID: string;
  names: RawPlayerNames;
  lookups: RawPlayerLookups;
  aliases: string[];
  teamID: string;
  playerTeams: IdMap<{ teamID: string }>;
}

export interface RawPlayerOverview {
  playerID: string;
  name: string;
  photo: string;
  teamID: string;
  alias: string;
  firstName: string;
  lastName: string;
}

export interface RawStat {
  statID: string;
  supportedLevels: { all: boolean; team: boolean; player: boolean };
  displays: { short: string; long: string };
  units: {
    short: Record<string, unknown>;
    long: { singular: string; plural: string };
  };
  description?: string;
  isScoreStat?: boolean;
  supportedSports?: Record<string, unknown>;
}

/* =========================
   3) RAW: Event status / results / activity / players / teams
========================= */

export interface RawEventStatus {
  hardStart: boolean;
  delayed: boolean;
  cancelled: boolean;
  startsAt: ISODateTimeString;
  started: boolean;
  displayShort: string;
  completed: boolean;
  displayLong: string;
  ended: boolean;
  periods: { started: string[]; ended: string[] };
  live: boolean;
  finalized: boolean;
  reGrade: boolean;
  currentPeriodID: string;
  previousPeriodID: string;
  oddsPresent: boolean;
  oddsAvailable: boolean;
}

export interface RawActivity { count: number; score: number; }

export interface RawUniqueProp {
  statID: string;
  sides: { side1: { sideID: string }; side2: { sideID: string } };
}

export type RawEventResults = IdMap<IdMap<IdMap<number>>>;

export interface RawEventInfo {
  seasonWeek: string;
  venue: RawVenue;
  referee: RawReferee;
  broadcasts: RawBroadcast[];
}

export interface RawEventTeams {
  home: RawTeamOverview;
  away: RawTeamOverview;
}

export interface RawEventPlayerInjuryCard {
  playerID: string;
  name: string;
  photo: string;
  teamID: string;
  alias: string;
  firstName: string;
  lastName: string;
  status: RawPlayerStatus;
  statusDetails: string;
}

export type RawEventPlayers = IdMap<RawEventPlayerInjuryCard>;

export interface RawEvent {
  eventID: string;
  sportID: string;
  leagueID: string;
  type: string;
  manual: boolean;
  info: RawEventInfo;
  status?: RawEventStatus;
  players?: RawEventPlayers;
  activity?: RawActivity;
  teams?: RawEventTeams;
  currentPeriodID?: string;
  previousPeriodID?: string;
  oddsPresent?: boolean;
  oddsAvailable?: boolean;
  odds?: Record<string, unknown>;
  pusherKey?: string;
  pusherOptions?: Record<string, unknown>;
  user?: string;
  channel?: string;
  results?: RawEventResults;
}

export interface RawStreamEventsPusherResponse {
  success: boolean;
  data: Array<{
    eventID: string;
    sportID: string;
    leagueID: string;
    type: string;
    manual: boolean;
    info: RawEventInfo;
  }>;
}

/* =========================
   4) RAW: Odds / Markets
========================= */

export interface RawByBookmakerOdds {
  bookmakerID: string;
  odds: string;
  overUnder: string;
  spread: string;
  available: boolean;
  isMainLine: boolean;
  lastUpdatedAt: ISODateTimeString;
  openOdds: string;
  closeOdds: string;
  openSpread: string;
  closeSpread: string;
  openOverUnder: string;
  closeOverUnder: string;
}

export interface RawOdds {
  oddID: string;
  sideID: string;
  statID: string;
  statEntityID: string;
  periodID: string;
  betTypeID: string;
  opposingOddID: string;
  byBookmaker: IdMap<RawByBookmakerOdds>;
}

export interface RawMarket {
  oddID: string;
  statID: string;
  statEntityID: string;
  periodID: string;
  betTypeID: string;
  sideID: string;
  playerID?: string;
  teamID?: string;
  marketGroupID: string;
  marketGroupName: string;
  marketGroupNameAlias: string;
  marketGroupNameBySport: IdMap<string>;
  isMainMarket: boolean;
  isMainDerivative: boolean;
  isSubPeriod: boolean;
  isProp: boolean;
  propType: RawPropType;
  isSupported: boolean;
  activeEvents: number;
  support: IdMap<unknown>;
}

/* ============================================================================
   5) NORMALIZED APP MODEL
============================================================================ */

export type BroadcastType = RawBroadcastType;
export type PropType = RawPropType;
export type PlayerStatus = RawPlayerStatus;

export interface Sport {
  sportId: string;
  enabled: boolean;
  hasMeaningfulHomeAway: boolean;
  name: string;
  shortName: string;
  pointWord: Record<string, unknown>;
  eventWord: Record<string, unknown>;
  imageIcon: string;
  squareImage: string;
  backgroundImage: string;
  defaultPopularityScore: number;
  clockType: string;
  basePeriods: string[];
  extraPeriods: string[];
}

export interface League {
  sportId: string;
  leagueId: string;
  enabled: boolean;
  name: string;
  shortName: string;
}

export interface Venue {
  name: string;
  countryName: string;
  countryCode: string;
  regionName: string;
  regionCode: string;
  city: string;
  address: string;
  capacity: number;
}

export interface Referee { name: string; }

export interface Broadcast {
  broadcasterId: string;
  name: string;
  type: BroadcastType;
}

export interface TeamNames {
  short: string;
  medium: string;
  long: string;
}

export interface TeamColors {
  primary: string;
  secondary: string;
  primaryContrast: string;
  secondaryContrast: string;
}

export interface Standings {
  position: string;
  wins: number;
  losses: number;
  ties: number;
  record: string;
  played: number;
  last5: string;
}

export interface Coach { name: string; }
export interface Owner { name: string; }

export interface Team {
  sportId: string;
  leagueId: string;
  teamId: string;
  logo: string;
  names: TeamNames;
  colors: TeamColors;
  standings: Standings;
  lookups: { teamName: string[] };
  coach: Coach;
  owner: Owner;
  venue: Venue;
}

export interface TeamSide {
  statEntityId: string;
  teamId: string;
  score: number;
  names: TeamNames;
  logo: string;
  colors: TeamColors;
}

export interface PlayerNames {
  display: string;
  firstName: string;
  lastName: string;
}

export interface PlayerLookups {
  fullName: string[];
  anyName: string[];
  initials: string[];
}

export interface Player {
  sportId: string;
  leagueId: string;
  playerId: string;
  jerseyNumber: number;
  position: string;
  names: PlayerNames;
  lookups: PlayerLookups;
  aliases: string[];
  teamId: string;
  playerTeams: Record<string, { teamId: string }>;
}

export interface PlayerOverview {
  playerId: string;
  name: string;
  photo: string;
  teamId: string;
  alias: string;
  firstName: string;
  lastName: string;
}

export interface EventPlayerStatusCard extends PlayerOverview {
  status: PlayerStatus;
  statusDetails: string;
}

export interface Stat {
  statId: string;
  supportedLevels: { all: boolean; team: boolean; player: boolean };
  displays: { short: string; long: string };
  units: {
    short: Record<string, unknown>;
    long: { singular: string; plural: string };
  };
  description?: string;
  isScoreStat?: boolean;
  supportedSports?: Record<string, unknown>;
}

export interface EventStatus {
  hardStart: boolean;
  delayed: boolean;
  cancelled: boolean;
  startsAt: ISODateTimeString;
  started: boolean;
  completed: boolean;
  ended: boolean;
  displayShort: string;
  displayLong: string;
  periods: { started: string[]; ended: string[] };
  live: boolean;
  finalized: boolean;
  reGrade: boolean;
  currentPeriodId: string;
  previousPeriodId: string;
  oddsPresent: boolean;
  oddsAvailable: boolean;
}

export type EventResults = Record<string, Record<string, Record<string, number>>>;

export interface Activity { count: number; score: number; }

export interface BookmakerOdds {
  bookmakerId: string;
  odds: string;
  overUnder: string;
  spread: string;
  available: boolean;
  isMainLine: boolean;
  lastUpdatedAt: ISODateTimeString;
  openOdds: string;
  closeOdds: string;
  openSpread: string;
  closeSpread: string;
  openOverUnder: string;
  closeOverUnder: string;
}

export interface OddsLine {
  oddId: string;
  sideId: string;
  statId: string;
  statEntityId: string;
  periodId: string;
  betTypeId: string;
  opposingOddId: string;
  byBookmaker: Record<string, BookmakerOdds>;
}

export interface Market {
  oddId: string;
  statId: string;
  statEntityId: string;
  periodId: string;
  betTypeId: string;
  sideId: string;
  playerId?: string;
  teamId?: string;
  marketGroupId: string;
  marketGroupName: string;
  marketGroupNameAlias: string;
  marketGroupNameBySport: Record<string, string>;
  isMainMarket: boolean;
  isMainDerivative: boolean;
  isSubPeriod: boolean;
  isProp: boolean;
  propType: PropType;
  isSupported: boolean;
  activeEvents: number;
  support: Record<string, unknown>;
}

export interface UniqueProp {
  statId: string;
  sides: { side1: { sideId: string }; side2: { sideId: string } };
}

export interface EventInfo {
  seasonWeek: string;
  venue: Venue;
  referee: Referee;
  broadcasts: Broadcast[];
}

export interface EventTeams {
  home: TeamSide;
  away: TeamSide;
}

export interface Event {
  eventId: string;
  sportId: string;
  leagueId: string;
  type: string;
  manual: boolean;
  info: EventInfo;
  status?: EventStatus;
  players?: Record<string, EventPlayerStatusCard>;
  activity?: Activity;
  teams?: EventTeams;
  currentPeriodId?: string;
  previousPeriodId?: string;
  oddsPresent?: boolean;
  oddsAvailable?: boolean;
  odds?: Record<string, unknown>;
  pusherKey?: string;
  pusherOptions?: Record<string, unknown>;
  user?: string;
  channel?: string;
  results?: EventResults;
}

export interface StreamEventsPusherResponse {
  success: boolean;
  data: Array<{
    eventId: string;
    sportId: string;
    leagueId: string;
    type: string;
    manual: boolean;
    info: EventInfo;
  }>;
}

/* ============================================================================
   6) RAW -> NORMALIZED ADAPTERS
============================================================================ */

export function normalizeVenue(v: RawVenue): Venue {
  return { ...v };
}

export function normalizeBroadcast(b: RawBroadcast): Broadcast {
  return { broadcasterId: b.broadcasterID, name: b.name, type: b.type };
}

export function normalizeEventInfo(info: RawEventInfo): EventInfo {
  return {
    seasonWeek: info.seasonWeek,
    venue: normalizeVenue(info.venue),
    referee: { name: info.referee?.name ?? "" },
    broadcasts: (info.broadcasts ?? []).map(normalizeBroadcast),
  };
}

export function normalizeEventStatus(s: RawEventStatus): EventStatus {
  return {
    hardStart: s.hardStart,
    delayed: s.delayed,
    cancelled: s.cancelled,
    startsAt: s.startsAt,
    started: s.started,
    completed: s.completed,
    ended: s.ended,
    displayShort: s.displayShort,
    displayLong: s.displayLong,
    periods: {
      started: s.periods?.started ?? [],
      ended: s.periods?.ended ?? [],
    },
    live: s.live,
    finalized: s.finalized,
    reGrade: s.reGrade,
    currentPeriodId: s.currentPeriodID,
    previousPeriodId: s.previousPeriodID,
    oddsPresent: s.oddsPresent,
    oddsAvailable: s.oddsAvailable,
  };
}

export function normalizeTeamOverviewSide(t: RawTeamOverview): TeamSide {
  return {
    statEntityId: t.statEntityID,
    teamId: t.teamID,
    score: t.score,
    names: t.names,
    logo: t.logo,
    colors: t.colors,
  };
}

export function normalizeEventPlayers(
  players?: RawEventPlayers
): Record<string, EventPlayerStatusCard> | undefined {
  if (!players) return undefined;
  const out: Record<string, EventPlayerStatusCard> = {};
  for (const [k, p] of Object.entries(players)) {
    out[k] = {
      playerId: p.playerID,
      name: p.name,
      photo: p.photo,
      teamId: p.teamID,
      alias: p.alias,
      firstName: p.firstName,
      lastName: p.lastName,
      status: p.status,
      statusDetails: p.statusDetails,
    };
  }
  return out;
}

export function normalizeEvent(raw: RawEvent): Event {
  return {
    eventId: raw.eventID,
    sportId: raw.sportID,
    leagueId: raw.leagueID,
    type: raw.type,
    manual: raw.manual,
    info: normalizeEventInfo(raw.info),
    status: raw.status ? normalizeEventStatus(raw.status) : undefined,
    players: normalizeEventPlayers(raw.players),
    activity: raw.activity
      ? { count: raw.activity.count, score: raw.activity.score }
      : undefined,
    teams: raw.teams
      ? {
          home: normalizeTeamOverviewSide(raw.teams.home),
          away: normalizeTeamOverviewSide(raw.teams.away),
        }
      : undefined,
    currentPeriodId: raw.currentPeriodID,
    previousPeriodId: raw.previousPeriodID,
    oddsPresent: raw.oddsPresent,
    oddsAvailable: raw.oddsAvailable,
    odds: raw.odds,
    pusherKey: raw.pusherKey,
    pusherOptions: raw.pusherOptions,
    user: raw.user,
    channel: raw.channel,
    results: raw.results,
  };
}

export function normalizeStreamEventsPusherResponse(
  r: RawStreamEventsPusherResponse
): StreamEventsPusherResponse {
  return {
    success: r.success,
    data: r.data.map((e) => ({
      eventId: e.eventID,
      sportId: e.sportID,
      leagueId: e.leagueID,
      type: e.type,
      manual: e.manual,
      info: normalizeEventInfo(e.info),
    })),
  };
}

export function normalizeBookmakerOdds(b: RawByBookmakerOdds): BookmakerOdds {
  return {
    bookmakerId: b.bookmakerID,
    odds: b.odds,
    overUnder: b.overUnder,
    spread: b.spread,
    available: b.available,
    isMainLine: b.isMainLine,
    lastUpdatedAt: b.lastUpdatedAt,
    openOdds: b.openOdds,
    closeOdds: b.closeOdds,
    openSpread: b.openSpread,
    closeSpread: b.closeSpread,
    openOverUnder: b.openOverUnder,
    closeOverUnder: b.closeOverUnder,
  };
}

export function normalizeOddsLine(o: RawOdds): OddsLine {
  const byBookmaker: Record<string, BookmakerOdds> = {};
  for (const [k, v] of Object.entries(o.byBookmaker ?? {})) {
    byBookmaker[k] = normalizeBookmakerOdds(v);
  }
  return {
    oddId: o.oddID,
    sideId: o.sideID,
    statId: o.statID,
    statEntityId: o.statEntityID,
    periodId: o.periodID,
    betTypeId: o.betTypeID,
    opposingOddId: o.opposingOddID,
    byBookmaker,
  };
}

export function normalizeMarket(m: RawMarket): Market {
  return {
    oddId: m.oddID,
    statId: m.statID,
    statEntityId: m.statEntityID,
    periodId: m.periodID,
    betTypeId: m.betTypeID,
    sideId: m.sideID,
    playerId: m.playerID,
    teamId: m.teamID,
    marketGroupId: m.marketGroupID,
    marketGroupName: m.marketGroupName,
    marketGroupNameAlias: m.marketGroupNameAlias,
    marketGroupNameBySport: m.marketGroupNameBySport ?? {},
    isMainMarket: m.isMainMarket,
    isMainDerivative: m.isMainDerivative,
    isSubPeriod: m.isSubPeriod,
    isProp: m.isProp,
    propType: m.propType,
    isSupported: m.isSupported,
    activeEvents: m.activeEvents,
    support: (m.support ?? {}) as Record<string, unknown>,
  };
}
