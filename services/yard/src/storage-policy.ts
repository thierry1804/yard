import { errors } from '@ccis/service-kit';
import type { Container, Zone } from './generated/prisma';

export function storageError(zone: Zone, row: number, col: number, type: string, stack: { type: string }[], weightKg?: number | null): string | null {
  if (row < 0 || col < 0 || row >= zone.rows || col >= zone.cols) return 'Emplacement hors zone.';
  const blocked = zone.blockedSlots as { row: number; col: number }[];
  if (blocked.some(s => s.row === row && s.col === col)) return 'Emplacement condamné.';
  if (zone.allowedTypes.length && !zone.allowedTypes.includes(type)) return 'Type non autorisé dans cette zone.';
  if (zone.reeferOnly && !type.includes('REEFER')) return 'Zone réservée aux reefers.';
  if (zone.maxWeightKg != null && weightKg != null && weightKg > zone.maxWeightKg) return 'Poids supérieur à la limite de la zone.';
  if (stack.length >= zone.maxTier) return `Pile pleine (hauteur maximale : ${zone.maxTier} niveaux).`;
  return null;
}

export function assertRelease(ct: Pick<Container, 'customsStatus' | 'clientHoldReason' | 'releaseRequired' | 'releaseReference'>): void {
  if (ct.customsStatus === 'HOLD') throw errors.ruleViolation('Sortie interdite : blocage douanier.');
  if (ct.clientHoldReason) throw errors.ruleViolation(`Sortie interdite : ${ct.clientHoldReason}`);
  if (ct.releaseRequired && !ct.releaseReference?.trim()) throw errors.ruleViolation('Sortie interdite : ordre de livraison requis.');
}
