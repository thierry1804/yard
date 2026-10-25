import type { Container, Movement, Zone } from './generated/prisma';
import type { ContainerWithReefer } from './yard-service';

export function toApiZone(z: Zone) {
  return { id: z.id, label: z.label, rows: z.rows, cols: z.cols, version: z.version };
}

export function toApiContainer(c: ContainerWithReefer) {
  return {
    id: c.id,
    containerNo: c.containerNo,
    type: c.type,
    isoCode: c.isoCode,
    client: c.client,
    weightKg: c.weightKg,
    zoneId: c.zoneId,
    row: c.row,
    col: c.col,
    tier: c.tier,
    status: c.status,
    entryDate: c.entryDate.toISOString(),
    plannedExitDate: c.plannedExitDate?.toISOString() ?? null,
    customsStatus: c.customsStatus,
    version: c.version,
    reefer: c.reefer
      ? {
          commodity: c.reefer.commodity,
          setPoint: c.reefer.setPoint,
          tempMin: c.reefer.tempMin,
          tempMax: c.reefer.tempMax,
          currentTemp: c.reefer.currentTemp,
          powerStatus: c.reefer.powerStatus,
          ventSetting: c.reefer.ventSetting,
          humidity: c.reefer.humidity,
          lastTempUpdate: c.reefer.lastReadingAt.toISOString(),
          tempAlert: c.reefer.alert,
        }
      : null,
  };
}

function position(zoneId: string | null, row: number | null, col: number | null, tier: number | null) {
  return zoneId === null ? null : { zoneId, row, col, tier };
}

export function toApiHistory(h: { containerNo: string; visits: (Container & { movements: Movement[] })[] }) {
  return {
    containerNo: h.containerNo,
    visits: h.visits.map((v) => ({
      containerId: v.id,
      status: v.status,
      type: v.type,
      isoCode: v.isoCode,
      client: v.client,
      weightKg: v.weightKg,
      customsStatus: v.customsStatus,
      entryDate: v.entryDate.toISOString(),
      plannedExitDate: v.plannedExitDate?.toISOString() ?? null,
      exitDate: v.exitDate?.toISOString() ?? null,
      movements: v.movements.map((m) => ({
        id: m.id,
        type: m.type,
        from: position(m.fromZoneId, m.fromRow, m.fromCol, m.fromTier),
        to: position(m.toZoneId, m.toRow, m.toCol, m.toTier),
        userId: m.userId,
        userEmail: m.userEmail,
        createdAt: m.createdAt.toISOString(),
        undoneAt: m.undoneAt?.toISOString() ?? null,
        undoneBy: m.undoneBy,
        undoneByEmail: m.undoneByEmail,
      })),
    })),
  };
}

export function toApiMovement(m: Movement & { container: Container }) {
  return {
    id: m.id,
    type: m.type,
    container: { id: m.container.id, containerNo: m.container.containerNo, type: m.container.type },
    fromZoneId: m.fromZoneId,
    fromRow: m.fromRow,
    fromCol: m.fromCol,
    fromTier: m.fromTier,
    toZoneId: m.toZoneId,
    toRow: m.toRow,
    toCol: m.toCol,
    toTier: m.toTier,
    userId: m.userId,
    createdAt: m.createdAt.toISOString(),
    undoneAt: m.undoneAt?.toISOString() ?? null,
  };
}
