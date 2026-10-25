import { fileURLToPath } from 'node:url';

export const PORT = Number(process.env.PORT) || 4000;
export const HOST = process.env.HOST || '127.0.0.1';
export const JWT_SECRET = process.env.JWT_SECRET || 'ccis-dev-secret-change-me';
export const DB_FILE = process.env.DB_FILE || fileURLToPath(new URL('../data/db.json', import.meta.url));
export const CORS_ORIGIN = process.env.CORS_ORIGIN || true;
// Seconds between simulated reefer temperature readings; 0 disables it.
export const REEFER_SIM_INTERVAL = Number(process.env.REEFER_SIM_INTERVAL ?? 30);
