export const REEFER_COMMODITIES = [
  { name: 'Fruits tropicaux', setPoint: 13, min: 10, max: 15 },
  { name: 'Viande congelée', setPoint: -18, min: -22, max: -15 },
  { name: 'Produits laitiers', setPoint: 4, min: 2, max: 6 },
  { name: 'Poisson frais', setPoint: -1, min: -3, max: 1 },
  { name: 'Chocolat', setPoint: 16, min: 14, max: 18 },
  { name: 'Vaccins', setPoint: 5, min: 2, max: 8 },
  { name: 'Légumes frais', setPoint: 7, min: 4, max: 10 },
  { name: 'Surgelés', setPoint: -25, min: -30, max: -20 },
] as const;

export interface ReeferDefaults {
  commodity: string;
  setPoint: number;
  tempMin: number;
  tempMax: number;
  currentTemp: number;
  powerStatus: 'on' | 'off';
  ventSetting: string;
  humidity: string;
  lastReadingAt: Date;
  alert: boolean;
}

export function computeTempAlert(r: { powerStatus: string; currentTemp: number; tempMin: number; tempMax: number }): boolean {
  return r.powerStatus === 'off' || r.currentTemp < r.tempMin || r.currentTemp > r.tempMax;
}

export function defaultReefer(now: Date, random: () => number = Math.random): ReeferDefaults {
  const c = REEFER_COMMODITIES[Math.floor(random() * REEFER_COMMODITIES.length)];
  const currentTemp = Math.round((c.setPoint + (random() - 0.5) * 2) * 10) / 10;
  const r: ReeferDefaults = {
    commodity: c.name,
    setPoint: c.setPoint,
    tempMin: c.min,
    tempMax: c.max,
    currentTemp,
    powerStatus: 'on',
    ventSetting: `${[0, 10, 15, 25][Math.floor(random() * 4)]} CBM/H`,
    humidity: `${Math.floor(60 + random() * 30)}%`,
    lastReadingAt: now,
    alert: false,
  };
  r.alert = computeTempAlert(r);
  return r;
}
