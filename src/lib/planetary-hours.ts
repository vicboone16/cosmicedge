/**
 * Planetary Hours Calculator
 * 
 * The Chaldean order of planets: Saturn, Jupiter, Mars, Sun, Venus, Mercury, Moon
 * Day rulers by weekday: Sun(0), Moon(1), Mars(2), Mercury(3), Jupiter(4), Venus(5), Saturn(6)
 */

export interface PlanetaryHour {
  planet: string;
  symbol: string;
  startTime: Date;
  endTime: Date;
  isDay: boolean;
  hourNumber: number;
}

const CHALDEAN_ORDER = [
  { planet: "Saturn", symbol: "♄" },
  { planet: "Jupiter", symbol: "♃" },
  { planet: "Mars", symbol: "♂" },
  { planet: "Sun", symbol: "☉" },
  { planet: "Venus", symbol: "♀" },
  { planet: "Mercury", symbol: "☿" },
  { planet: "Moon", symbol: "☽" },
];

// Day ruler index in Chaldean order for each weekday (Sun=0 through Sat=6)
const DAY_RULER_INDEX = [3, 6, 2, 5, 1, 4, 0]; // Sun, Moon, Mars, Mercury, Jupiter, Venus, Saturn

/**
 * Calculate sunrise/sunset approximation for a given date and latitude.
 * Uses a simplified formula; for production, use a proper ephemeris.
 */
function getSunTimes(date: Date, latitude: number): { sunrise: Date; sunset: Date } {
  const dayOfYear = Math.floor((date.getTime() - new Date(date.getFullYear(), 0, 0).getTime()) / 86400000);
  const latRad = (latitude * Math.PI) / 180;

  // Simplified declination
  const declination = 23.45 * Math.sin(((360 / 365) * (dayOfYear - 81) * Math.PI) / 180);
  const declRad = (declination * Math.PI) / 180;

  // Hour angle
  const cosH = -Math.tan(latRad) * Math.tan(declRad);
  const clampedCosH = Math.max(-1, Math.min(1, cosH));
  const hourAngle = (Math.acos(clampedCosH) * 180) / Math.PI;

  const sunriseHour = 12 - hourAngle / 15;
  const sunsetHour = 12 + hourAngle / 15;

  const sunrise = new Date(date);
  sunrise.setHours(Math.floor(sunriseHour), Math.round((sunriseHour % 1) * 60), 0, 0);

  const sunset = new Date(date);
  sunset.setHours(Math.floor(sunsetHour), Math.round((sunsetHour % 1) * 60), 0, 0);

  return { sunrise, sunset };
}

/**
 * Get all 24 planetary hours for a given date and location.
 */
export function getPlanetaryHours(date: Date, latitude: number = 40.7): PlanetaryHour[] {
  const { sunrise, sunset } = getSunTimes(date, latitude);

  const nextDay = new Date(date);
  nextDay.setDate(nextDay.getDate() + 1);
  const { sunrise: nextSunrise } = getSunTimes(nextDay, latitude);

  const dayLength = sunset.getTime() - sunrise.getTime();
  const nightLength = nextSunrise.getTime() - sunset.getTime();
  const dayHourLen = dayLength / 12;
  const nightHourLen = nightLength / 12;

  const weekday = date.getDay();
  const startIndex = DAY_RULER_INDEX[weekday];

  const hours: PlanetaryHour[] = [];

  for (let i = 0; i < 24; i++) {
    const isDay = i < 12;
    const planetIndex = (startIndex + (7 - i % 7)) % 7;
    // Actually the correct sequence: day ruler is hour 1, then follow Chaldean order backwards
    const idx = (startIndex + i) % 7;
    const chaldeanIdx = [3, 6, 2, 5, 1, 4, 0]; // reverse lookup
    // Simpler: planetary hours follow the sequence starting from day ruler
    // Hour 1 = day ruler, then descend in Chaldean order
    const sequenceMap = [0, 6, 5, 4, 3, 2, 1]; // Saturn->Moon->Mercury->Venus->Mars->Jupiter->Saturn
    // Actually, the standard sequence from any starting planet goes:
    // Start, then skip 2 in Chaldean order (or equivalently go backwards)
    const actualIdx = (7 - ((startIndex + i * 4) % 7)) % 7;
    // Simplify: use a direct computation
    // The ruler of hour h on day d: Chaldean[(dayRulerPos - h) mod 7]
    // where dayRulerPos is the position of the day ruler in reverse Chaldean
    // Let's just use the well-known table approach:
    const planetPos = ((startIndex * 1) + i) % 7;
    // This gives us the index into a sequence. The sequence for planetary hours
    // starting from any planet descends: Sun(3)->Venus(4)->Mercury(5)->Moon(6)->Saturn(0)->Jupiter(1)->Mars(2)
    // That's indices 3,4,5,6,0,1,2 repeating = just (start + i) % 7 mapped to Chaldean
    const planet = CHALDEAN_ORDER[planetPos];

    const startTime = isDay
      ? new Date(sunrise.getTime() + i * dayHourLen)
      : new Date(sunset.getTime() + (i - 12) * nightHourLen);

    const endTime = isDay
      ? new Date(sunrise.getTime() + (i + 1) * dayHourLen)
      : new Date(sunset.getTime() + (i - 11) * nightHourLen);

    hours.push({
      planet: planet.planet,
      symbol: planet.symbol,
      startTime,
      endTime,
      isDay,
      hourNumber: i + 1,
    });
  }

  return hours;
}

/**
 * Get the planetary hour ruler for a specific moment.
 */
export function getPlanetaryHourAt(date: Date, latitude: number = 40.7): PlanetaryHour | null {
  const hours = getPlanetaryHours(date, latitude);
  const time = date.getTime();
  return hours.find(h => time >= h.startTime.getTime() && time < h.endTime.getTime()) || hours[0];
}

/**
 * Get the planetary day ruler for a given date.
 */
export function getDayRuler(date: Date): { planet: string; symbol: string } {
  const idx = DAY_RULER_INDEX[date.getDay()];
  return CHALDEAN_ORDER[idx];
}
