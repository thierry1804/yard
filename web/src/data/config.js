export const MAX_TIER = 3;

export const ZONES = [
  { id: 'A', label: 'Zone A — Import', rows: 6, cols: 10 },
  { id: 'B', label: 'Zone B — Export', rows: 5, cols: 10 },
  { id: 'C', label: 'Zone C — Transit', rows: 4, cols: 10 },
  { id: 'R', label: 'Zone R — Reefer', rows: 3, cols: 8 },
];

export const TYPES = ['empty-20', 'empty-40', 'full-20', 'full-40', 'reefer', 'reefer-full'];

export const TYPE_LABELS = {
  'empty-20': "Vide·20'",
  'empty-40': "Vide·40'",
  'full-20': "Plein·20'",
  'full-40': "Plein·40'",
  'reefer': 'Reefer·Vide',
  'reefer-full': 'Reefer·Plein',
};

// ISO 6346 size/type codes mapped to internal types
export const ISO_CODES = {
  'empty-20': '22G0',
  'empty-40': '42G0',
  'full-20':  '22G1',
  'full-40':  '42G1',
  'reefer':   '22R0',
  'reefer-full': '42R1',
};

export const ISO_DESCRIPTIONS = {
  '22G0': "20' Dry - Vide",
  '42G0': "40' Dry - Vide",
  '22G1': "20' Dry - Plein",
  '42G1': "40' Dry - Plein",
  '22R0': "20' Reefer - Vide",
  '22R1': "20' Reefer - Plein",
  '42R0': "40' Reefer - Vide",
  '42R1': "40' Reefer - Plein",
  '45R1': "40' HC Reefer - Plein",
};

export const CARRIERS = ['MSCU', 'CMAU', 'MAEU', 'HLCU', 'OOLU', 'EISU', 'TCLU', 'MSKU', 'ONEU', 'CSLU'];
export const CLIENTS = ['Jovenna', 'Star', 'Brasseries', 'Socota', 'Galana', 'Henri Fraise', 'Total Energies', 'Ambatovy', 'QMM', 'Colas'];

// Reefer temperature ranges by commodity type
export const REEFER_COMMODITIES = [
  { name: 'Fruits tropicaux', setPoint: 13, min: 10, max: 15 },
  { name: 'Viande congelée', setPoint: -18, min: -22, max: -15 },
  { name: 'Produits laitiers', setPoint: 4, min: 2, max: 6 },
  { name: 'Poisson frais', setPoint: -1, min: -3, max: 1 },
  { name: 'Chocolat', setPoint: 16, min: 14, max: 18 },
  { name: 'Vaccins', setPoint: 5, min: 2, max: 8 },
  { name: 'Légumes frais', setPoint: 7, min: 4, max: 10 },
  { name: 'Surgelés', setPoint: -25, min: -30, max: -20 },
];
