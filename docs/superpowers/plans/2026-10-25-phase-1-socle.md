# Phase 1 — Socle : Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remplacer le backend en mémoire par des microservices (auth, gateway, yard) sur PostgreSQL et RabbitMQ, avec publication garantie des événements (outbox), verrouillage optimiste et temps réel fiable côté front, sans perte de fonctionnalité.

**Architecture:** Monorepo npm workspaces. Trois services Fastify en TypeScript (`auth`, `gateway`, `yard`), chacun avec sa base Postgres (Prisma 6). Trois packages techniques partagés (`contracts`, `messaging`, `service-kit`). `yard-service` écrit ses événements dans une table `outbox` dans la même transaction que la donnée ; un relais in-process les publie dans RabbitMQ avec *publisher confirms*. La gateway vérifie les JWT RS256 émis par `auth-service`, route le REST et relaie les événements RabbitMQ aux navigateurs via WebSocket (ticket à usage unique). Infra en Docker Compose.

**Tech Stack:** Node 22, TypeScript 5.9 (strict), Fastify 5, @fastify/websocket 11, @fastify/cors 11, Prisma 6.19, amqplib 0.10, zod 3.25, jose 6, argon2, pino 9, uuid 11, Vitest 3.2, Testcontainers 11, PostgreSQL 16, RabbitMQ 3.13.

**Spec:** `docs/superpowers/specs/2026-10-25-architecture-microservices-design.md` (sections 2, 3.1–3.4, 5.1, 5.2, 6, 7, 8, 9, 10, 11 — phase 1).

## Périmètre de cette phase

Inclus : § 11 phase 1 de la spec.

Reporté explicitement :
- **phase 2** : table `inbox`, retries par files à délai, files de parking. La phase 1 n'a aucun consommateur durable : la gateway relaie aux navigateurs, et un doublon y est inoffensif puisque le front recharge ;
- **phase 2** : pré-avis, ordres de travail, règle douane ;
- **phase 3** : simulation de température (le prototype en avait une ; en phase 1 les valeurs reefer restent celles du seed et des réglages manuels) ;
- **phase 4** : `/metrics`, Dockerfiles de production.

La spec prévoit (§ 3.4) de déclencher le relais « immédiatement après un commit via `LISTEN/NOTIFY` ». Le relais tournant dans le même processus que l'écrivain, ce plan l'implémente par un appel direct `relay.kick()` après commit, plus la scrutation toutes les 250 ms : même comportement, sans connexion `pg` supplémentaire.

## Global Constraints

- Node 22, TypeScript 5.9 strict ; le front reste en JavaScript.
- Prisma **6.19.x** (pas 7) ; client généré dans `services/<svc>/src/generated/prisma` (`binaryTargets = ["native", "debian-openssl-3.0.x"]`).
- zod **3.25.x** (API v3), Vitest **3.2.x**, amqplib **0.10.x**, Testcontainers **11.x**, pino **9.x**, uuid **11.x**.
- Une base par service : `auth`, `yard` (`cargowise`, `telemetry` créées mais vides). Aucun service ne lit la base d'un autre.
- Ports hôte : front 5180, gateway 4000, Postgres 5442, RabbitMQ 5682 / management 15682. Ports internes : auth 4001, yard 4002.
- Format d'erreur HTTP unique : `{ "error": "<message en français>", "code": "<CODE>", "correlationId": "<id>" }` ; codes `VALIDATION` 400, `UNAUTHORIZED` 401, `FORBIDDEN` 403, `NOT_FOUND` 404, `RULE_VIOLATION` 409, `VERSION_CONFLICT` 409, `RATE_LIMITED` 429, `SERVICE_UNAVAILABLE` 503, `INTERNAL` 500.
- Enveloppe d'événement : `id` (UUID v7), `type`, `version`, `occurredAt`, `source`, `correlationId`, `causationId`, `aggregateId`, `aggregateVersion`, `actor`, `data`.
- Nommage des événements `<domaine>.<objet>.<action>` ; exchange `<domaine>.events` (topic, durable) ; routing key = `type`.
- JWT RS256, émetteur `ccis-auth`, durée 12 h, `sub` = userId, claim `role`.
- Rôles : `VIEWER` (lecture), `OPERATOR` (mouvements, compactage, reefers), `ADMIN` (tout + zones).
- Règles yard : 3 niveaux max ; un 40' jamais sur un 20' (est « 20' » tout type dont le nom contient `20`) ; seul le sommet se déplace ; zone non supprimable si non vide, non réductible si des conteneurs sortent des dimensions ; dimensions 1–30 rangées × 1–40 baies ; id de zone 1–4 caractères alphanumériques ; numéro de conteneur `^[A-Z]{4}\d{7}$`.
- Les routes REST existantes du front (`src/api/client.js`) restent identiques ; seuls s'ajoutent `expectedVersion` et `POST /ws-ticket`.
- Messages utilisateur en français.

## Review Focus

1. **Deux opérateurs agissent sur la même pile au même moment** : l'un réussit, l'autre reçoit un 409 clair, jamais deux conteneurs au même niveau. Test : Task 8, `concurrent arrivals on a 2-high stack`.
2. **RabbitMQ arrêté pendant que les opérateurs travaillent** : les requêtes réussissent, les événements partent au retour du broker. Tests : Task 5 `relay waits for the broker`, Task 12 `smoke-broker-down.sh`.
3. **Session expirée (REST ou WebSocket)** : retour à l'écran de connexion avec un message, jamais de boucle de reconnexion. Tests : Task 13 `ws.test.js` (code 4401), Task 10 (401 gateway).
4. **Saisie opérateur approximative** (numéro en minuscules ou avec espaces, id de zone en minuscules, date invalide) : normalisée ou refusée en 400 lisible, jamais 500. Tests : Task 8 `normalizes container number`, Task 9 `invalid plannedExitDate → 400`.
5. **Départ envoyé par le front sans corps JSON** (le code actuel fait `POST` sans body) : accepté. Test : Task 9 `departure without body`.

---

## File Structure

```
ccis-yard-view/
├── package.json                      # workspaces + scripts racine
├── tsconfig.base.json
├── .env.example
├── web/                              # front déplacé (git mv)
│   ├── package.json                  # @ccis/web (+ vitest)
│   └── src/api/{client.js,ws.js,ws.test.js}, hooks/{useAuth.js,useYardState.js}, components/{Header.jsx,LoginScreen.jsx}, App.jsx, index.css
├── packages/
│   ├── contracts/src/{envelope.ts,yard-events.ts,registry.ts,index.ts}  test/contracts.test.ts
│   ├── service-kit/src/{errors.ts,error-handler.ts,identity.ts,logger.ts,health.ts,create-app.ts,index.ts}  test/service-kit.test.ts
│   └── messaging/src/{amqp-client.ts,topology.ts,outbox.ts,relay.ts,subscriber.ts,index.ts}  test/messaging.test.ts
├── services/
│   ├── auth/  prisma/schema.prisma, prisma/migrations/…, src/{config.ts,passwords.ts,tokens.ts,rate-limiter.ts,app.ts,main.ts}, scripts/seed.ts, test/…
│   ├── yard/  prisma/…, src/{config.ts,domain/rules.ts,domain/reefer.ts,events.ts,locks.ts,yard-service.ts,mappers.ts,routes.ts,app.ts,main.ts}, scripts/seed.ts, test/…
│   └── gateway/ src/{config.ts,verify.ts,tickets.ts,hub.ts,forward.ts,app.ts,main.ts}, test/…
└── infra/
    ├── docker-compose.yml
    ├── postgres/init-databases.sh
    ├── rabbitmq/init.sh
    └── scripts/{gen-keys.sh,smoke.mjs,smoke-broker-down.sh}
```

---

### Task 1: Monorepo et déplacement du front

**Files:**
- Move: `src/`, `public/`, `index.html`, `vite.config.js`, `package.json` → `web/`
- Create: `package.json` (racine), `tsconfig.base.json`
- Modify: `.gitignore`, `web/package.json`

**Interfaces:**
- Produces : workspaces `web`, `packages/*`, `services/*` ; `tsconfig.base.json` étendu par tous les packages TS.

- [ ] **Step 1: Arrêter l'ancien backend et le serveur Vite qui tournent encore**

Run: `ss -ltnp | grep -E ':(4000|5180) '` puis `kill <pid>` pour chacun des deux PID affichés.
Expected : plus rien n'écoute sur 4000 et 5180.

- [ ] **Step 2: Déplacer le front**

```bash
cd ccis-yard-view
mkdir web
git mv src public index.html vite.config.js package.json web/
git rm -q --cached package-lock.json && rm package-lock.json
rm -rf node_modules
```

- [ ] **Step 3: Renommer le package front**

Dans `web/package.json`, remplacer `"name": "ccis-yard-view",` par `"name": "@ccis/web",` et ajouter dans `scripts` : `"test": "vitest run"`. Ajouter dans `devDependencies` : `"vitest": "3.2.7"`.

- [ ] **Step 4: Créer `package.json` racine**

```json
{
  "name": "ccis-yard-view",
  "private": true,
  "workspaces": ["web", "packages/*", "services/*"],
  "scripts": {
    "dev:web": "npm run dev -w @ccis/web",
    "generate": "npm run generate --workspaces --if-present",
    "test": "npm test --workspaces --if-present",
    "typecheck": "npm run typecheck --workspaces --if-present",
    "infra:up": "docker compose -f infra/docker-compose.yml --env-file .env up -d",
    "infra:down": "docker compose -f infra/docker-compose.yml --env-file .env down",
    "seed": "npm run seed -w @ccis/auth-service && npm run seed -w @ccis/yard-service"
  },
  "devDependencies": {
    "typescript": "5.9.3",
    "tsx": "4.23.15",
    "@types/node": "22.20.5",
    "vitest": "3.2.7"
  }
}
```

- [ ] **Step 5: Créer `tsconfig.base.json`**

```json
{
  "compilerOptions": {
    "target": "ES2023",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noUncheckedIndexedAccess": false,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "types": ["node"]
  }
}
```

- [ ] **Step 6: Compléter `.gitignore`**

Ajouter les lignes :
```
infra/keys/
services/*/src/generated/
```

- [ ] **Step 7: Installer et vérifier que le front build toujours**

Run: `npm install && npm run build -w @ccis/web`
Expected : `✓ built in …` sans erreur.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "chore: npm workspaces monorepo, move frontend to web/"
```

---

### Task 2: Infrastructure Docker (Postgres, RabbitMQ, clés JWT)

**Files:**
- Create: `infra/docker-compose.yml`, `infra/postgres/init-databases.sh`, `infra/rabbitmq/init.sh`, `infra/scripts/gen-keys.sh`, `.env.example`

**Interfaces:**
- Produces : Postgres sur `127.0.0.1:5442` avec bases `auth`, `yard`, `cargowise`, `telemetry` (rôles `auth_svc`, `yard_svc`, …) ; RabbitMQ sur 5682/15682 avec exchanges `yard.events`, `cargowise.events`, `telemetry.events` (topic) et `yard.commands` (direct), utilisateurs `yard` et `gateway` ; clés `infra/keys/jwt-private.pem` / `jwt-public.pem`. Les services applicatifs sont ajoutés au compose en Task 12.

- [ ] **Step 1: `.env.example`**

```dotenv
# Copier en .env (non versionné) avant `npm run infra:up`
POSTGRES_USER=ccis
POSTGRES_PASSWORD=ccis-dev
AUTH_DB_PASSWORD=auth-dev
YARD_DB_PASSWORD=yard-dev
CARGOWISE_DB_PASSWORD=cargowise-dev
TELEMETRY_DB_PASSWORD=telemetry-dev
RABBITMQ_DEFAULT_USER=admin
RABBITMQ_DEFAULT_PASS=admin-dev
RABBITMQ_YARD_PASSWORD=yard-dev
RABBITMQ_GATEWAY_PASSWORD=gateway-dev
POSTGRES_PORT=5442
RABBITMQ_PORT=5682
RABBITMQ_MGMT_PORT=15682
GATEWAY_PORT=4000
CORS_ORIGIN=http://127.0.0.1:5180,http://localhost:5180
```

- [ ] **Step 2: `infra/postgres/init-databases.sh`**

```sh
#!/bin/sh
# Exécuté une seule fois par l'image postgres, au premier démarrage du volume.
set -eu

create() {
  psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres <<SQL
CREATE ROLE $1 LOGIN PASSWORD '$2';
CREATE DATABASE $3 OWNER $1;
SQL
}

create auth_svc "$AUTH_DB_PASSWORD" auth
create yard_svc "$YARD_DB_PASSWORD" yard
create cargowise_svc "$CARGOWISE_DB_PASSWORD" cargowise
create telemetry_svc "$TELEMETRY_DB_PASSWORD" telemetry
```

- [ ] **Step 3: `infra/rabbitmq/init.sh`**

```sh
#!/bin/sh
# Déclare exchanges, utilisateurs et permissions via l'API de management.
set -eu
API="http://rabbitmq:15672/api"
AUTH="$RABBITMQ_DEFAULT_USER:$RABBITMQ_DEFAULT_PASS"

put() {
  curl -fsS -u "$AUTH" -H 'content-type: application/json' -X PUT "$API/$1" -d "$2" >/dev/null
}

for ex in yard.events cargowise.events telemetry.events; do
  put "exchanges/%2F/$ex" '{"type":"topic","durable":true}'
done
put "exchanges/%2F/yard.commands" '{"type":"direct","durable":true}'

put "users/yard" "{\"password\":\"$RABBITMQ_YARD_PASSWORD\",\"tags\":\"\"}"
put "permissions/%2F/yard" '{"configure":"^yard\\.(events|commands)$","write":"^yard\\.(events|commands)$","read":"^$"}'

put "users/gateway" "{\"password\":\"$RABBITMQ_GATEWAY_PASSWORD\",\"tags\":\"\"}"
put "permissions/%2F/gateway" '{"configure":"^gateway\\..*","write":"^gateway\\..*","read":"^(gateway\\..*|yard\\.events|cargowise\\.events|telemetry\\.events)$"}'

echo "RabbitMQ initialisé."
```

- [ ] **Step 4: `infra/scripts/gen-keys.sh`**

```sh
#!/bin/sh
# Génère la paire de clés JWT RS256 de développement (jamais versionnée).
set -eu
DIR="$(cd "$(dirname "$0")/.." && pwd)/keys"
mkdir -p "$DIR"
if [ -f "$DIR/jwt-private.pem" ]; then echo "Clés déjà présentes dans $DIR"; exit 0; fi
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out "$DIR/jwt-private.pem"
openssl pkey -in "$DIR/jwt-private.pem" -pubout -out "$DIR/jwt-public.pem"
chmod 600 "$DIR/jwt-private.pem"
echo "Clés générées dans $DIR"
```

- [ ] **Step 5: `infra/docker-compose.yml` (infra seule)**

```yaml
name: ccis

services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      AUTH_DB_PASSWORD: ${AUTH_DB_PASSWORD}
      YARD_DB_PASSWORD: ${YARD_DB_PASSWORD}
      CARGOWISE_DB_PASSWORD: ${CARGOWISE_DB_PASSWORD}
      TELEMETRY_DB_PASSWORD: ${TELEMETRY_DB_PASSWORD}
    volumes:
      - pgdata:/var/lib/postgresql/data
      - ./postgres/init-databases.sh:/docker-entrypoint-initdb.d/10-init-databases.sh:ro
    ports:
      - "127.0.0.1:${POSTGRES_PORT:-5442}:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER}"]
      interval: 5s
      timeout: 3s
      retries: 20

  rabbitmq:
    image: rabbitmq:3.13-management-alpine
    environment:
      RABBITMQ_DEFAULT_USER: ${RABBITMQ_DEFAULT_USER}
      RABBITMQ_DEFAULT_PASS: ${RABBITMQ_DEFAULT_PASS}
    volumes:
      - rabbitdata:/var/lib/rabbitmq
    ports:
      - "127.0.0.1:${RABBITMQ_PORT:-5682}:5672"
      - "127.0.0.1:${RABBITMQ_MGMT_PORT:-15682}:15672"
    healthcheck:
      test: ["CMD", "rabbitmq-diagnostics", "-q", "ping"]
      interval: 5s
      timeout: 5s
      retries: 30

  rabbitmq-init:
    image: curlimages/curl:8.10.1
    depends_on:
      rabbitmq:
        condition: service_healthy
    environment:
      RABBITMQ_DEFAULT_USER: ${RABBITMQ_DEFAULT_USER}
      RABBITMQ_DEFAULT_PASS: ${RABBITMQ_DEFAULT_PASS}
      RABBITMQ_YARD_PASSWORD: ${RABBITMQ_YARD_PASSWORD}
      RABBITMQ_GATEWAY_PASSWORD: ${RABBITMQ_GATEWAY_PASSWORD}
    volumes:
      - ./rabbitmq/init.sh:/init.sh:ro
    entrypoint: ["/bin/sh", "/init.sh"]
    restart: "no"

volumes:
  pgdata:
  rabbitdata:
```

- [ ] **Step 6: Lancer et vérifier**

```bash
chmod +x infra/postgres/init-databases.sh infra/rabbitmq/init.sh infra/scripts/gen-keys.sh
cp .env.example .env
sh infra/scripts/gen-keys.sh
npm run infra:up
docker compose -f infra/docker-compose.yml --env-file .env logs rabbitmq-init
docker compose -f infra/docker-compose.yml --env-file .env exec postgres psql -U ccis -d postgres -c '\l' | grep -E 'auth|yard|cargowise|telemetry'
curl -s -u admin:admin-dev http://127.0.0.1:15682/api/exchanges/%2F | grep -o '"name":"[a-z]*\.\(events\|commands\)"'
```
Expected : log `RabbitMQ initialisé.` ; les 4 bases listées ; les 4 exchanges listés.

- [ ] **Step 7: Commit**

```bash
git add infra .env.example
git commit -m "infra: docker compose with postgres (one db per service) and rabbitmq"
```

---

### Task 3: Package `@ccis/contracts`

**Files:**
- Create: `packages/contracts/package.json`, `tsconfig.json`, `src/envelope.ts`, `src/yard-events.ts`, `src/registry.ts`, `src/index.ts`, `test/contracts.test.ts`

**Interfaces:**
- Produces :
  - `roleSchema`, `type Role = 'ADMIN' | 'OPERATOR' | 'VIEWER'`, `type Actor = { userId: string; role: Role } | null`
  - `envelopeSchema`, `type Envelope<TType extends string = string, TData = unknown>`
  - `containerTypeSchema`, `type ContainerType`, `customsStatusSchema`, `positionSchema`, `containerSnapshotSchema`, `type ContainerSnapshot`, `type Position`
  - `eventSchemas`, `type EventType`, `type EventData<T extends EventType>`
  - `createEnvelope<T extends EventType>(type: T, data: EventData<T>, meta: EnvelopeMeta): Envelope<T, EventData<T>>`
  - `interface EnvelopeMeta { source: string; correlationId: string; causationId?: string | null; aggregateId: string; aggregateVersion: number; actor: Actor }`
  - `parseEnvelope(raw: unknown): Envelope` (valide aussi `data` selon le type connu)
  - `exchangeFor(type: string): string`

- [ ] **Step 1: Squelette du package**

`packages/contracts/package.json` :
```json
{
  "name": "@ccis/contracts",
  "private": true,
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "types": "./src/index.ts",
  "scripts": { "test": "vitest run", "typecheck": "tsc -p tsconfig.json" },
  "dependencies": { "uuid": "11.1.1", "zod": "3.25.76" }
}
```
`packages/contracts/tsconfig.json` :
```json
{ "extends": "../../tsconfig.base.json", "include": ["src", "test"] }
```
Run: `npm install`

- [ ] **Step 2: Écrire le test qui échoue**

`packages/contracts/test/contracts.test.ts` :
```ts
import { describe, expect, it } from 'vitest';
import { ZodError } from 'zod';
import { createEnvelope, exchangeFor, parseEnvelope } from '../src/index';

const container = {
  id: 'c0a8012e-0000-4000-8000-000000000001',
  containerNo: 'MSCU1234567',
  type: 'FULL_20' as const,
  isoCode: '22G1',
  client: 'Star',
  weightKg: 12000,
  position: { zoneId: 'A', row: 0, col: 1, tier: 1 },
  entryDate: '2026-10-25T10:00:00.000Z',
  plannedExitDate: null,
  customsStatus: 'RELEASED' as const,
  version: 1,
};
const meta = {
  source: 'yard-service',
  correlationId: 'corr-1',
  aggregateId: container.id,
  aggregateVersion: 1,
  actor: { userId: 'u1', role: 'OPERATOR' as const },
};

describe('createEnvelope', () => {
  it('builds a complete v1 envelope', () => {
    const env = createEnvelope('yard.container.arrived', { container }, meta);
    expect(env.type).toBe('yard.container.arrived');
    expect(env.version).toBe(1);
    expect(env.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(env.causationId).toBeNull();
    expect(env.data.container.containerNo).toBe('MSCU1234567');
    expect(() => new Date(env.occurredAt).toISOString()).not.toThrow();
  });

  it('rejects data that does not match the schema', () => {
    expect(() =>
      createEnvelope('yard.container.arrived', { container: { ...container, type: 'BOAT' } } as never, meta),
    ).toThrow(ZodError);
  });

  it('generates time-ordered ids', () => {
    const a = createEnvelope('yard.zone.deleted', { zoneId: 'A' }, meta);
    const b = createEnvelope('yard.zone.deleted', { zoneId: 'B' }, meta);
    expect(a.id < b.id).toBe(true);
  });
});

describe('parseEnvelope', () => {
  it('round-trips through JSON', () => {
    const env = createEnvelope('yard.container.moved', { container, from: container.position, to: { ...container.position, col: 2 } }, meta);
    const parsed = parseEnvelope(JSON.parse(JSON.stringify(env)));
    expect(parsed).toEqual(env);
  });

  it('rejects unknown event types', () => {
    const env = { ...createEnvelope('yard.zone.deleted', { zoneId: 'A' }, meta), type: 'yard.zone.exploded' };
    expect(() => parseEnvelope(env)).toThrow(/inconnu/);
  });
});

describe('exchangeFor', () => {
  it('maps the domain prefix to its events exchange', () => {
    expect(exchangeFor('yard.container.moved')).toBe('yard.events');
    expect(exchangeFor('telemetry.alert.raised')).toBe('telemetry.events');
  });
});
```

- [ ] **Step 3: Vérifier l'échec**

Run: `npm test -w @ccis/contracts`
Expected : FAIL, `Cannot find module '../src/index'`.

- [ ] **Step 4: Implémenter**

`packages/contracts/src/envelope.ts` :
```ts
import { z } from 'zod';

export const roleSchema = z.enum(['ADMIN', 'OPERATOR', 'VIEWER']);
export type Role = z.infer<typeof roleSchema>;

export const actorSchema = z.object({ userId: z.string().min(1), role: roleSchema }).nullable();
export type Actor = z.infer<typeof actorSchema>;

export const envelopeSchema = z.object({
  id: z.string().uuid(),
  type: z.string().min(1),
  version: z.number().int().positive(),
  occurredAt: z.string().datetime(),
  source: z.string().min(1),
  correlationId: z.string().min(1),
  causationId: z.string().nullable(),
  aggregateId: z.string().min(1),
  aggregateVersion: z.number().int().nonnegative(),
  actor: actorSchema,
  data: z.unknown(),
});

export type Envelope<TType extends string = string, TData = unknown> = Omit<
  z.infer<typeof envelopeSchema>,
  'type' | 'data'
> & { type: TType; data: TData };
```

`packages/contracts/src/yard-events.ts` :
```ts
import { z } from 'zod';

export const containerTypeSchema = z.enum(['EMPTY_20', 'EMPTY_40', 'FULL_20', 'FULL_40', 'REEFER', 'REEFER_FULL']);
export type ContainerType = z.infer<typeof containerTypeSchema>;

export const customsStatusSchema = z.enum(['RELEASED', 'HOLD']);

export const positionSchema = z.object({
  zoneId: z.string().min(1),
  row: z.number().int().nonnegative(),
  col: z.number().int().nonnegative(),
  tier: z.number().int().positive(),
});
export type Position = z.infer<typeof positionSchema>;

export const containerSnapshotSchema = z.object({
  id: z.string().min(1),
  containerNo: z.string().min(1),
  type: containerTypeSchema,
  isoCode: z.string(),
  client: z.string().nullable(),
  weightKg: z.number().int().nullable(),
  position: positionSchema,
  entryDate: z.string().datetime(),
  plannedExitDate: z.string().datetime().nullable(),
  customsStatus: customsStatusSchema,
  version: z.number().int().positive(),
});
export type ContainerSnapshot = z.infer<typeof containerSnapshotSchema>;

const zoneSchema = z.object({
  id: z.string(),
  label: z.string(),
  rows: z.number().int(),
  cols: z.number().int(),
  version: z.number().int(),
});

const relocationSchema = z.object({
  container: containerSnapshotSchema,
  from: positionSchema,
  to: positionSchema,
});

export const yardEventSchemas = {
  'yard.container.arrived': z.object({ container: containerSnapshotSchema }),
  'yard.container.departed': z.object({ container: containerSnapshotSchema, from: positionSchema }),
  'yard.container.moved': relocationSchema,
  'yard.container.transferred': relocationSchema,
  'yard.container.relocated': relocationSchema.extend({ reason: z.enum(['COMPACT', 'UNDO']) }),
  'yard.zone.created': z.object({ zone: zoneSchema }),
  'yard.zone.updated': z.object({ zone: zoneSchema }),
  'yard.zone.deleted': z.object({ zoneId: z.string() }),
  'yard.reefer.configured': z.object({
    containerId: z.string(),
    containerNo: z.string(),
    commodity: z.string(),
    setPoint: z.number(),
    tempMin: z.number(),
    tempMax: z.number(),
    powerStatus: z.enum(['on', 'off']),
  }),
} as const;
```

`packages/contracts/src/registry.ts` :
```ts
import type { z } from 'zod';
import { v7 as uuidv7 } from 'uuid';
import { envelopeSchema, type Actor, type Envelope } from './envelope';
import { yardEventSchemas } from './yard-events';

export const eventSchemas = { ...yardEventSchemas } as const;
export type EventType = keyof typeof eventSchemas;
export type EventData<T extends EventType> = z.infer<(typeof eventSchemas)[T]>;

const EVENT_VERSION = 1;

export interface EnvelopeMeta {
  source: string;
  correlationId: string;
  causationId?: string | null;
  aggregateId: string;
  aggregateVersion: number;
  actor: Actor;
}

export function createEnvelope<T extends EventType>(
  type: T,
  data: EventData<T>,
  meta: EnvelopeMeta,
): Envelope<T, EventData<T>> {
  const parsed = eventSchemas[type].parse(data) as EventData<T>;
  return {
    id: uuidv7(),
    type,
    version: EVENT_VERSION,
    occurredAt: new Date().toISOString(),
    source: meta.source,
    correlationId: meta.correlationId,
    causationId: meta.causationId ?? null,
    aggregateId: meta.aggregateId,
    aggregateVersion: meta.aggregateVersion,
    actor: meta.actor,
    data: parsed,
  };
}

export function parseEnvelope(raw: unknown): Envelope {
  const env = envelopeSchema.parse(raw);
  const schema = (eventSchemas as Record<string, z.ZodTypeAny>)[env.type];
  if (!schema) throw new Error(`Type d'événement inconnu : ${env.type}`);
  return { ...env, data: schema.parse(env.data) };
}

export function exchangeFor(type: string): string {
  return `${type.split('.')[0]}.events`;
}
```

`packages/contracts/src/index.ts` :
```ts
export * from './envelope';
export * from './yard-events';
export * from './registry';
```

- [ ] **Step 5: Vérifier le succès et le typage**

Run: `npm test -w @ccis/contracts && npm run typecheck -w @ccis/contracts`
Expected : 6 tests PASS, aucune erreur TypeScript.

- [ ] **Step 6: Commit**

```bash
git add packages/contracts package-lock.json
git commit -m "feat(contracts): event envelope and yard event schemas"
```

---

### Task 4: Package `@ccis/service-kit`

**Files:**
- Create: `packages/service-kit/package.json`, `tsconfig.json`, `src/errors.ts`, `src/error-handler.ts`, `src/identity.ts`, `src/logger.ts`, `src/health.ts`, `src/create-app.ts`, `src/index.ts`, `test/service-kit.test.ts`

**Interfaces:**
- Consumes : `Role`, `roleSchema`, `Actor` de `@ccis/contracts`.
- Produces :
  - `type ErrorCode`, `class AppError extends Error { code: ErrorCode; status: number }`
  - `errors.{validation, unauthorized, forbidden, notFound, ruleViolation, versionConflict, rateLimited, serviceUnavailable}(message: string): AppError`
  - `interface Identity { userId: string; role: Role }` ; `FastifyRequest.identity?: Identity`
  - `readIdentity(req): Identity | null` (depuis `x-user-id` / `x-user-role`)
  - `requireRole(min: Role): preHandler` ; `actorOf(req): Actor`
  - `redactUrl(url: string): string`
  - `type ReadinessCheck = () => Promise<void>`
  - `createApp(opts: { service: string; checks?: Record<string, ReadinessCheck>; logger?: boolean }): FastifyInstance` (id de requête = `x-correlation-id` entrant ou UUID v7, renvoyé en en-tête de réponse ; erreurs normalisées ; `/health/live`, `/health/ready`)

- [ ] **Step 1: Squelette du package**

`packages/service-kit/package.json` :
```json
{
  "name": "@ccis/service-kit",
  "private": true,
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "types": "./src/index.ts",
  "scripts": { "test": "vitest run", "typecheck": "tsc -p tsconfig.json" },
  "dependencies": {
    "@ccis/contracts": "*",
    "fastify": "5.12.7",
    "pino": "9.14.0",
    "uuid": "11.1.1",
    "zod": "3.25.76"
  }
}
```
`packages/service-kit/tsconfig.json` : `{ "extends": "../../tsconfig.base.json", "include": ["src", "test"] }`
Run: `npm install`

- [ ] **Step 2: Écrire le test qui échoue**

`packages/service-kit/test/service-kit.test.ts` :
```ts
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createApp, errors, redactUrl, requireRole } from '../src/index';

function app() {
  const a = createApp({ service: 'test', logger: false, checks: { ok: async () => {} } });
  a.get('/boom/app', async () => { throw errors.ruleViolation('Pile pleine.'); });
  a.get('/boom/zod', async () => z.object({ rows: z.number() }).parse({ rows: 'x' }));
  a.get('/boom/crash', async () => { throw new Error('secret detail'); });
  a.get('/admin', { preHandler: requireRole('ADMIN') }, async (req) => ({ user: req.identity }));
  return a;
}

describe('error handler', () => {
  it('formats AppError with code and correlationId', async () => {
    const res = await app().inject({ url: '/boom/app', headers: { 'x-correlation-id': 'corr-42' } });
    expect(res.statusCode).toBe(409);
    expect(res.json()).toEqual({ error: 'Pile pleine.', code: 'RULE_VIOLATION', correlationId: 'corr-42' });
    expect(res.headers['x-correlation-id']).toBe('corr-42');
  });

  it('turns zod errors into 400 VALIDATION', async () => {
    const res = await app().inject({ url: '/boom/zod' });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('VALIDATION');
    expect(res.json().error).toContain('rows');
  });

  it('hides internal errors', async () => {
    const res = await app().inject({ url: '/boom/crash' });
    expect(res.statusCode).toBe(500);
    expect(res.json()).toMatchObject({ code: 'INTERNAL', error: 'Erreur interne du serveur.' });
    expect(res.body).not.toContain('secret');
  });

  it('generates a correlation id when none is given', async () => {
    const res = await app().inject({ url: '/boom/app' });
    expect(res.json().correlationId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('returns 404 NOT_FOUND for unknown routes', async () => {
    const res = await app().inject({ url: '/nope' });
    expect(res.statusCode).toBe(404);
    expect(res.json().code).toBe('NOT_FOUND');
  });
});

describe('requireRole', () => {
  it('401 without identity headers', async () => {
    const res = await app().inject({ url: '/admin' });
    expect(res.statusCode).toBe(401);
    expect(res.json().code).toBe('UNAUTHORIZED');
  });

  it('403 when the role is too low', async () => {
    const res = await app().inject({ url: '/admin', headers: { 'x-user-id': 'u1', 'x-user-role': 'OPERATOR' } });
    expect(res.statusCode).toBe(403);
    expect(res.json().error).toContain('ADMIN');
  });

  it('401 on an unknown role value', async () => {
    const res = await app().inject({ url: '/admin', headers: { 'x-user-id': 'u1', 'x-user-role': 'ROOT' } });
    expect(res.statusCode).toBe(401);
  });

  it('exposes the identity when allowed', async () => {
    const res = await app().inject({ url: '/admin', headers: { 'x-user-id': 'u1', 'x-user-role': 'ADMIN' } });
    expect(res.json()).toEqual({ user: { userId: 'u1', role: 'ADMIN' } });
  });
});

describe('health', () => {
  it('live and ready', async () => {
    const a = app();
    expect((await a.inject({ url: '/health/live' })).statusCode).toBe(200);
    expect((await a.inject({ url: '/health/ready' })).json()).toEqual({ ok: true, checks: { ok: 'ok' } });
  });

  it('ready returns 503 when a check fails', async () => {
    const a = createApp({ service: 't', logger: false, checks: { db: async () => { throw new Error('down'); } } });
    const res = await a.inject({ url: '/health/ready' });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toEqual({ ok: false, checks: { db: 'down' } });
  });
});

describe('redactUrl', () => {
  it('masks token and ticket query params', () => {
    expect(redactUrl('/ws?ticket=abc&x=1')).toBe('/ws?ticket=***&x=1');
    expect(redactUrl('/ws?x=1&token=abc')).toBe('/ws?x=1&token=***');
    expect(redactUrl('/zones')).toBe('/zones');
  });
});
```

- [ ] **Step 3: Vérifier l'échec**

Run: `npm test -w @ccis/service-kit`
Expected : FAIL, `Cannot find module '../src/index'`.

- [ ] **Step 4: Implémenter**

`packages/service-kit/src/errors.ts` :
```ts
export type ErrorCode =
  | 'VALIDATION'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'RULE_VIOLATION'
  | 'VERSION_CONFLICT'
  | 'RATE_LIMITED'
  | 'SERVICE_UNAVAILABLE'
  | 'INTERNAL';

const STATUS: Record<ErrorCode, number> = {
  VALIDATION: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  RULE_VIOLATION: 409,
  VERSION_CONFLICT: 409,
  RATE_LIMITED: 429,
  SERVICE_UNAVAILABLE: 503,
  INTERNAL: 500,
};

export class AppError extends Error {
  readonly status: number;

  constructor(readonly code: ErrorCode, message: string) {
    super(message);
    this.status = STATUS[code];
  }
}

export const errors = {
  validation: (m: string) => new AppError('VALIDATION', m),
  unauthorized: (m: string) => new AppError('UNAUTHORIZED', m),
  forbidden: (m: string) => new AppError('FORBIDDEN', m),
  notFound: (m: string) => new AppError('NOT_FOUND', m),
  ruleViolation: (m: string) => new AppError('RULE_VIOLATION', m),
  versionConflict: (m: string) => new AppError('VERSION_CONFLICT', m),
  rateLimited: (m: string) => new AppError('RATE_LIMITED', m),
  serviceUnavailable: (m: string) => new AppError('SERVICE_UNAVAILABLE', m),
};
```

`packages/service-kit/src/error-handler.ts` :
```ts
import type { FastifyInstance } from 'fastify';
import { ZodError } from 'zod';
import { AppError } from './errors';

type AnyError = Error & { statusCode?: number };

export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler<AnyError>((err, req, reply) => {
    const correlationId = req.id;
    if (err instanceof AppError) {
      return reply.code(err.status).send({ error: err.message, code: err.code, correlationId });
    }
    if (err instanceof ZodError) {
      const issue = err.issues[0];
      const path = issue?.path.join('.');
      const message = issue ? (path ? `${path} : ${issue.message}` : issue.message) : 'Requête invalide.';
      return reply.code(400).send({ error: message, code: 'VALIDATION', correlationId });
    }
    if (err.statusCode && err.statusCode >= 400 && err.statusCode < 500) {
      return reply.code(err.statusCode).send({ error: err.message, code: 'VALIDATION', correlationId });
    }
    req.log.error({ err }, 'unhandled error');
    return reply.code(500).send({ error: 'Erreur interne du serveur.', code: 'INTERNAL', correlationId });
  });

  app.setNotFoundHandler((req, reply) =>
    reply.code(404).send({ error: `Route ${req.method} ${req.url} introuvable.`, code: 'NOT_FOUND', correlationId: req.id }),
  );
}
```

`packages/service-kit/src/identity.ts` :
```ts
import type { FastifyRequest } from 'fastify';
import { roleSchema, type Actor, type Role } from '@ccis/contracts';
import { errors } from './errors';

export interface Identity {
  userId: string;
  role: Role;
}

declare module 'fastify' {
  interface FastifyRequest {
    identity?: Identity;
  }
}

const RANK: Record<Role, number> = { VIEWER: 0, OPERATOR: 1, ADMIN: 2 };

// Identity is injected by the gateway after verifying the JWT; services are
// only reachable on the internal network, so these headers are trusted here.
export function readIdentity(req: FastifyRequest): Identity | null {
  const userId = req.headers['x-user-id'];
  if (typeof userId !== 'string' || userId.length === 0) return null;
  const role = roleSchema.safeParse(req.headers['x-user-role']);
  return role.success ? { userId, role: role.data } : null;
}

export function requireRole(min: Role) {
  return async (req: FastifyRequest): Promise<void> => {
    const identity = readIdentity(req);
    if (!identity) throw errors.unauthorized('Authentification requise.');
    if (RANK[identity.role] < RANK[min]) {
      throw errors.forbidden(`Action réservée au rôle ${min} (vous êtes ${identity.role}).`);
    }
    req.identity = identity;
  };
}

export function actorOf(req: FastifyRequest): Actor {
  return req.identity ? { userId: req.identity.userId, role: req.identity.role } : null;
}
```

`packages/service-kit/src/logger.ts` :
```ts
import type { FastifyServerOptions } from 'fastify';

export function redactUrl(url: string): string {
  return url.replace(/([?&](?:token|ticket)=)[^&]*/g, '$1***');
}

export function loggerOptions(service: string): FastifyServerOptions['logger'] {
  return {
    level: process.env.LOG_LEVEL ?? 'info',
    base: { service },
    redact: { paths: ['req.headers.authorization', 'req.headers.cookie'], censor: '***' },
    serializers: {
      req: (req: { method: string; url: string; id: string }) => ({
        method: req.method,
        url: redactUrl(req.url),
        correlationId: req.id,
      }),
    },
  };
}
```

`packages/service-kit/src/health.ts` :
```ts
import type { FastifyInstance } from 'fastify';

export type ReadinessCheck = () => Promise<void>;

export function registerHealth(app: FastifyInstance, checks: Record<string, ReadinessCheck>): void {
  app.get('/health/live', async () => ({ ok: true }));
  app.get('/health/ready', async (_req, reply) => {
    const results: Record<string, string> = {};
    let ok = true;
    for (const [name, check] of Object.entries(checks)) {
      try {
        await check();
        results[name] = 'ok';
      } catch (err) {
        ok = false;
        results[name] = err instanceof Error ? err.message : 'ko';
      }
    }
    reply.code(ok ? 200 : 503);
    return { ok, checks: results };
  });
}
```

`packages/service-kit/src/create-app.ts` :
```ts
import Fastify, { type FastifyInstance } from 'fastify';
import { v7 as uuidv7 } from 'uuid';
import { registerErrorHandler } from './error-handler';
import { registerHealth, type ReadinessCheck } from './health';
import { loggerOptions } from './logger';

export interface CreateAppOptions {
  service: string;
  checks?: Record<string, ReadinessCheck>;
  logger?: boolean;
}

export function createApp(opts: CreateAppOptions): FastifyInstance {
  const app = Fastify({
    logger: opts.logger === false ? false : loggerOptions(opts.service),
    requestIdHeader: 'x-correlation-id',
    genReqId: () => uuidv7(),
    trustProxy: true,
  });
  registerErrorHandler(app);
  registerHealth(app, opts.checks ?? {});
  app.addHook('onSend', async (req, reply) => {
    reply.header('x-correlation-id', req.id);
  });
  return app;
}
```

`packages/service-kit/src/index.ts` :
```ts
export * from './errors';
export * from './error-handler';
export * from './identity';
export * from './logger';
export * from './health';
export * from './create-app';
```

- [ ] **Step 5: Vérifier le succès et le typage**

Run: `npm test -w @ccis/service-kit && npm run typecheck -w @ccis/service-kit`
Expected : 12 tests PASS, aucune erreur TypeScript.

- [ ] **Step 6: Commit**

```bash
git add packages/service-kit package-lock.json
git commit -m "feat(service-kit): fastify bootstrap, errors, identity, health"
```

---

### Task 5: Package `@ccis/messaging` (connexion, outbox, relais, abonnement)

**Files:**
- Create: `packages/messaging/package.json`, `tsconfig.json`, `vitest.config.ts`, `src/amqp-client.ts`, `src/topology.ts`, `src/outbox.ts`, `src/relay.ts`, `src/subscriber.ts`, `src/index.ts`, `test/messaging.test.ts`

**Interfaces:**
- Consumes : `Envelope`, `envelopeSchema` de `@ccis/contracts`.
- Produces :
  - `interface Logger { info(obj: unknown, msg?: string): void; warn(obj: unknown, msg?: string): void; error(obj: unknown, msg?: string): void }`
  - `class AmqpClient { constructor(url: string, log: Logger); start(): Promise<void>; stop(): Promise<void>; onConnected(setup: (ch: ConfirmChannel) => Promise<void>): void; readonly channel: ConfirmChannel | null; readonly connected: boolean }` (reconnexion automatique, délai 1 s doublé jusqu'à 15 s)
  - `declareExchanges(ch: ConfirmChannel, names: readonly string[]): Promise<void>` (`*.commands` en direct, sinon topic, durables)
  - `interface OutboxRecord { id: string; exchange: string; routingKey: string; payload: Envelope }`
  - `interface OutboxStore { claimBatch(limit: number, publish: (records: OutboxRecord[]) => Promise<void>): Promise<number> }`
  - `type PrismaLike` ; `prismaOutboxStore(prisma: PrismaLike): OutboxStore` (table `outbox`, `FOR UPDATE SKIP LOCKED`)
  - `class OutboxRelay { constructor(opts: { store: OutboxStore; client: AmqpClient; log: Logger; intervalMs?: number; batchSize?: number }); start(): void; stop(): Promise<void>; kick(): void }`
  - `subscribeEphemeral(client: AmqpClient, opts: { queuePrefix: string; bindings: { exchange: string; pattern: string }[]; onMessage: (env: Envelope) => void; log: Logger }): void`

- [ ] **Step 1: Squelette du package**

`packages/messaging/package.json` :
```json
{
  "name": "@ccis/messaging",
  "private": true,
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "types": "./src/index.ts",
  "scripts": { "test": "vitest run", "typecheck": "tsc -p tsconfig.json" },
  "dependencies": { "@ccis/contracts": "*", "amqplib": "0.10.9" },
  "devDependencies": { "@types/amqplib": "0.10.8", "@testcontainers/rabbitmq": "11.14.0" }
}
```
`packages/messaging/tsconfig.json` : `{ "extends": "../../tsconfig.base.json", "include": ["src", "test", "vitest.config.ts"] }`
`packages/messaging/vitest.config.ts` :
```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({ test: { testTimeout: 30_000, hookTimeout: 180_000 } });
```
Run: `npm install`

- [ ] **Step 2: Écrire le test qui échoue**

`packages/messaging/test/messaging.test.ts` :
```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { RabbitMQContainer, type StartedRabbitMQContainer } from '@testcontainers/rabbitmq';
import { createEnvelope, type Envelope } from '@ccis/contracts';
import { AmqpClient, OutboxRelay, declareExchanges, subscribeEphemeral, type OutboxRecord, type OutboxStore } from '../src/index';

const silent = { info: () => {}, warn: () => {}, error: () => {} };

class MemoryStore implements OutboxStore {
  pending: OutboxRecord[] = [];
  published: string[] = [];
  calls = 0;
  async claimBatch(limit: number, publish: (r: OutboxRecord[]) => Promise<void>) {
    this.calls++;
    const batch = this.pending.slice(0, limit);
    if (batch.length === 0) return 0;
    await publish(batch);
    this.pending = this.pending.slice(batch.length);
    this.published.push(...batch.map((b) => b.id));
    return batch.length;
  }
}

function record(zoneId: string): OutboxRecord {
  const env = createEnvelope('yard.zone.deleted', { zoneId }, {
    source: 'test', correlationId: 'c', aggregateId: zoneId, aggregateVersion: 1, actor: null,
  });
  return { id: env.id, exchange: 'yard.events', routingKey: env.type, payload: env };
}

function waitFor(cond: () => boolean, ms = 5000): Promise<void> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const t = setInterval(() => {
      if (cond()) { clearInterval(t); resolve(); }
      else if (Date.now() - start > ms) { clearInterval(t); reject(new Error('timeout')); }
    }, 20);
  });
}

let rabbit: StartedRabbitMQContainer;
let url: string;

beforeAll(async () => {
  rabbit = await new RabbitMQContainer('rabbitmq:3.13-management-alpine').start();
  url = rabbit.getAmqpUrl();
});
afterAll(async () => { await rabbit?.stop(); });

describe('OutboxRelay', () => {
  it('publishes pending records and a subscriber receives them in order', async () => {
    const publisher = new AmqpClient(url, silent);
    publisher.onConnected((ch) => declareExchanges(ch, ['yard.events']));
    const consumer = new AmqpClient(url, silent);
    const received: Envelope[] = [];
    subscribeEphemeral(consumer, {
      queuePrefix: 'test',
      bindings: [{ exchange: 'yard.events', pattern: 'yard.zone.*' }],
      onMessage: (env) => received.push(env),
      log: silent,
    });
    await publisher.start();
    await consumer.start();

    const store = new MemoryStore();
    store.pending.push(record('A'), record('B'), record('C'));
    const relay = new OutboxRelay({ store, client: publisher, log: silent, intervalMs: 50, batchSize: 2 });
    relay.start();

    await waitFor(() => received.length === 3);
    expect(received.map((e) => (e.data as { zoneId: string }).zoneId)).toEqual(['A', 'B', 'C']);
    expect(store.pending).toHaveLength(0);

    await relay.stop();
    await publisher.stop();
    await consumer.stop();
  });

  it('relay waits for the broker: nothing is claimed while disconnected', async () => {
    const client = new AmqpClient(url, silent);
    client.onConnected((ch) => declareExchanges(ch, ['yard.events']));
    const store = new MemoryStore();
    store.pending.push(record('Z'));
    const relay = new OutboxRelay({ store, client, log: silent, intervalMs: 20 });
    relay.start();
    await new Promise((r) => setTimeout(r, 150));
    expect(store.calls).toBe(0);
    expect(store.pending).toHaveLength(1);

    await client.start();
    await waitFor(() => store.pending.length === 0);
    await relay.stop();
    await client.stop();
  });

  it('keeps records when publication fails (unknown exchange)', async () => {
    const client = new AmqpClient(url, silent);
    await client.start();
    const store = new MemoryStore();
    store.pending.push({ ...record('X'), exchange: 'does.not.exist' });
    const relay = new OutboxRelay({ store, client, log: silent, intervalMs: 1000 });
    relay.kick();
    await new Promise((r) => setTimeout(r, 300));
    expect(store.pending).toHaveLength(1);
    await relay.stop();
    await client.stop();
  });
});

describe('AmqpClient', () => {
  it('retries until the broker is reachable', async () => {
    const client = new AmqpClient('amqp://guest:guest@127.0.0.1:1', silent);
    await client.start();
    expect(client.connected).toBe(false);
    await client.stop();
  });
});
```

- [ ] **Step 3: Vérifier l'échec**

Run: `npm test -w @ccis/messaging`
Expected : FAIL, `Cannot find module '../src/index'`.

- [ ] **Step 4: Implémenter**

`packages/messaging/src/amqp-client.ts` :
```ts
import amqp, { type ConfirmChannel } from 'amqplib';

export interface Logger {
  info(obj: unknown, msg?: string): void;
  warn(obj: unknown, msg?: string): void;
  error(obj: unknown, msg?: string): void;
}

type Connection = Awaited<ReturnType<typeof amqp.connect>>;
type Setup = (ch: ConfirmChannel) => Promise<void>;

// Keeps one confirm channel open and re-runs every registered setup (topology,
// consumers) after each reconnection. While disconnected, `channel` is null and
// callers (the outbox relay) simply wait: nothing is lost, it stays in the outbox.
export class AmqpClient {
  private conn: Connection | null = null;
  private ch: ConfirmChannel | null = null;
  private readonly setups: Setup[] = [];
  private stopped = true;
  private retryMs = 1000;
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly url: string, private readonly log: Logger) {}

  get channel(): ConfirmChannel | null {
    return this.ch;
  }

  get connected(): boolean {
    return this.ch !== null;
  }

  onConnected(setup: Setup): void {
    this.setups.push(setup);
    if (this.ch) void setup(this.ch).catch((err) => this.log.error({ err }, 'amqp setup failed'));
  }

  async start(): Promise<void> {
    this.stopped = false;
    await this.connect();
  }

  async stop(): Promise<void> {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    const conn = this.conn;
    this.conn = null;
    this.ch = null;
    await conn?.close().catch(() => {});
  }

  private async connect(): Promise<void> {
    let conn: Connection | null = null;
    try {
      conn = await amqp.connect(this.url);
      const ch = await conn.createConfirmChannel();
      const opened = conn;
      opened.on('error', (err) => this.log.warn({ err }, 'amqp connection error'));
      opened.on('close', () => this.handleClose(opened));
      ch.on('error', (err) => this.log.warn({ err }, 'amqp channel error'));
      ch.on('close', () => {
        if (this.ch === ch) void opened.close().catch(() => {});
      });
      for (const setup of this.setups) await setup(ch);
      if (this.stopped) {
        await opened.close().catch(() => {});
        return;
      }
      this.conn = opened;
      this.ch = ch;
      this.retryMs = 1000;
      this.log.info({}, 'amqp connected');
    } catch (err) {
      this.log.warn({ err }, 'amqp connect failed');
      await conn?.close().catch(() => {});
      this.scheduleReconnect();
    }
  }

  private handleClose(conn: Connection): void {
    if (this.conn !== conn) return;
    this.conn = null;
    this.ch = null;
    if (this.stopped) return;
    this.log.warn({}, 'amqp connection closed');
    this.scheduleReconnect();
  }

  private scheduleReconnect(): void {
    if (this.stopped || this.timer) return;
    const delay = this.retryMs;
    this.retryMs = Math.min(this.retryMs * 2, 15_000);
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.connect();
    }, delay);
  }
}
```

`packages/messaging/src/topology.ts` :
```ts
import type { ConfirmChannel } from 'amqplib';

// Exchanges are created by infra/rabbitmq/init.sh; owners also assert theirs
// (idempotent) so tests and fresh brokers work without the init script.
export async function declareExchanges(ch: ConfirmChannel, names: readonly string[]): Promise<void> {
  for (const name of names) {
    await ch.assertExchange(name, name.endsWith('.commands') ? 'direct' : 'topic', { durable: true });
  }
}
```

`packages/messaging/src/outbox.ts` :
```ts
import type { Envelope } from '@ccis/contracts';

export interface OutboxRecord {
  id: string;
  exchange: string;
  routingKey: string;
  payload: Envelope;
}

export interface OutboxStore {
  claimBatch(limit: number, publish: (records: OutboxRecord[]) => Promise<void>): Promise<number>;
}

type SqlClient = {
  $queryRawUnsafe<T = unknown>(query: string, ...values: unknown[]): Promise<T>;
  $executeRawUnsafe(query: string, ...values: unknown[]): Promise<number>;
};

export type PrismaLike = SqlClient & {
  $transaction<R>(fn: (tx: SqlClient) => Promise<R>): Promise<R>;
};

// Every service owns an identical `outbox` table (see each prisma/schema.prisma).
// Rows stay locked while they are published; if publishing throws, the
// transaction rolls back and the rows are retried on the next cycle.
export function prismaOutboxStore(prisma: PrismaLike): OutboxStore {
  return {
    async claimBatch(limit, publish) {
      return prisma.$transaction(async (tx) => {
        const rows = await tx.$queryRawUnsafe<OutboxRecord[]>(
          `SELECT id, exchange, "routingKey", payload FROM outbox
           WHERE "publishedAt" IS NULL
           ORDER BY "createdAt", id
           LIMIT $1
           FOR UPDATE SKIP LOCKED`,
          limit,
        );
        if (rows.length === 0) return 0;
        await publish(rows);
        await tx.$executeRawUnsafe(
          `UPDATE outbox SET "publishedAt" = now() WHERE id = ANY($1::uuid[])`,
          rows.map((r) => r.id),
        );
        return rows.length;
      });
    },
  };
}
```

`packages/messaging/src/relay.ts` :
```ts
import type { ConfirmChannel } from 'amqplib';
import type { AmqpClient, Logger } from './amqp-client';
import type { OutboxRecord, OutboxStore } from './outbox';

export async function publishAll(ch: ConfirmChannel, records: OutboxRecord[]): Promise<void> {
  for (const r of records) {
    ch.publish(r.exchange, r.routingKey, Buffer.from(JSON.stringify(r.payload)), {
      persistent: true,
      contentType: 'application/json',
      messageId: r.payload.id,
      type: r.payload.type,
      timestamp: Date.now(),
    });
  }
  await ch.waitForConfirms();
}

export interface OutboxRelayOptions {
  store: OutboxStore;
  client: AmqpClient;
  log: Logger;
  intervalMs?: number;
  batchSize?: number;
}

export class OutboxRelay {
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private again = false;

  constructor(private readonly opts: OutboxRelayOptions) {}

  start(): void {
    this.timer = setInterval(() => this.kick(), this.opts.intervalMs ?? 250);
    this.kick();
  }

  async stop(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    while (this.running) await new Promise((r) => setTimeout(r, 20));
  }

  // Called after each commit by the owning service, and by the interval.
  kick(): void {
    if (this.running) {
      this.again = true;
      return;
    }
    void this.drain();
  }

  private async drain(): Promise<void> {
    this.running = true;
    const size = this.opts.batchSize ?? 100;
    try {
      do {
        this.again = false;
        const ch = this.opts.client.channel;
        if (!ch) break;
        let claimed: number;
        do {
          claimed = await this.opts.store.claimBatch(size, (records) => publishAll(ch, records));
        } while (claimed === size);
      } while (this.again);
    } catch (err) {
      this.opts.log.warn({ err }, 'outbox relay: publication échouée, nouvel essai au prochain cycle');
    } finally {
      this.running = false;
    }
  }
}
```

`packages/messaging/src/subscriber.ts` :
```ts
import { randomUUID } from 'node:crypto';
import { envelopeSchema, type Envelope } from '@ccis/contracts';
import type { AmqpClient, Logger } from './amqp-client';

export interface Binding {
  exchange: string;
  pattern: string;
}

// Exclusive, auto-deleted queue re-created on every reconnection. For
// consumers that only relay live notifications (gateway → browsers): missed
// messages are acceptable because clients resynchronise on reconnect.
export function subscribeEphemeral(
  client: AmqpClient,
  opts: { queuePrefix: string; bindings: Binding[]; onMessage: (env: Envelope) => void; log: Logger },
): void {
  client.onConnected(async (ch) => {
    const { queue } = await ch.assertQueue(`${opts.queuePrefix}.${randomUUID()}`, {
      exclusive: true,
      autoDelete: true,
      durable: false,
    });
    for (const b of opts.bindings) await ch.bindQueue(queue, b.exchange, b.pattern);
    await ch.consume(
      queue,
      (msg) => {
        if (!msg) return;
        try {
          opts.onMessage(envelopeSchema.parse(JSON.parse(msg.content.toString())) as Envelope);
        } catch (err) {
          opts.log.warn({ err }, 'message ignoré : enveloppe invalide');
        }
      },
      { noAck: true },
    );
  });
}
```

`packages/messaging/src/index.ts` :
```ts
export * from './amqp-client';
export * from './topology';
export * from './outbox';
export * from './relay';
export * from './subscriber';
```

- [ ] **Step 5: Vérifier le succès et le typage**

Run: `npm test -w @ccis/messaging && npm run typecheck -w @ccis/messaging`
Expected : 4 tests PASS (le premier lancement télécharge l'image RabbitMQ), aucune erreur TypeScript.

- [ ] **Step 6: Commit**

```bash
git add packages/messaging package-lock.json
git commit -m "feat(messaging): amqp client with reconnect, outbox relay, ephemeral subscriber"
```

---

### Task 6: `auth-service`

**Files:**
- Create: `services/auth/package.json`, `tsconfig.json`, `vitest.config.ts`, `prisma/schema.prisma`, `prisma/migrations/migration_lock.toml`, `prisma/migrations/20261025000000_init/migration.sql`, `src/config.ts`, `src/passwords.ts`, `src/tokens.ts`, `src/rate-limiter.ts`, `src/app.ts`, `src/main.ts`, `scripts/seed.ts`, `test/global-setup.ts`, `test/rate-limiter.test.ts`, `test/auth.test.ts`

**Interfaces:**
- Consumes : `createApp`, `errors`, `requireRole`, `readIdentity` (service-kit).
- Produces :
  - HTTP `POST /auth/login` `{ email, password }` → `200 { accessToken, user: { id, email, name, role } }` | `401 UNAUTHORIZED` | `429 RATE_LIMITED`
  - HTTP `GET /auth/me` (en-têtes `x-user-id`, `x-user-role`) → `{ id, email, name, role }`
  - JWT RS256 : `iss = "ccis-auth"`, `sub = user.id`, `role`, `exp = iat + 12h`
  - `buildAuthApp(deps: { prisma: PrismaClient; signer: TokenSigner; limiter?: FixedWindowLimiter; logger?: boolean }): FastifyInstance`
  - `createTokenSigner(privateKeyPem: string): Promise<TokenSigner>` avec `TokenSigner = { sign(user: { id: string; role: Role }): Promise<string> }`
  - `class FixedWindowLimiter { constructor(max: number, windowMs: number, now?: () => number); hit(key: string): boolean }`

- [ ] **Step 1: Squelette et schéma**

`services/auth/package.json` :
```json
{
  "name": "@ccis/auth-service",
  "private": true,
  "type": "module",
  "scripts": {
    "generate": "prisma generate",
    "start": "prisma migrate deploy && tsx src/main.ts",
    "dev": "tsx watch src/main.ts",
    "seed": "tsx scripts/seed.ts",
    "test": "vitest run",
    "typecheck": "tsc -p tsconfig.json"
  },
  "dependencies": {
    "@ccis/contracts": "*",
    "@ccis/service-kit": "*",
    "@prisma/client": "6.19.3",
    "argon2": "0.45.1",
    "jose": "6.2.13",
    "zod": "3.25.76"
  },
  "devDependencies": {
    "prisma": "6.19.3",
    "@testcontainers/postgresql": "11.14.0"
  }
}
```
`services/auth/tsconfig.json` : `{ "extends": "../../tsconfig.base.json", "include": ["src", "test", "scripts", "vitest.config.ts"] }`
`services/auth/vitest.config.ts` :
```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { globalSetup: ['./test/global-setup.ts'], fileParallelism: false, testTimeout: 30_000, hookTimeout: 180_000 },
});
```

`services/auth/prisma/schema.prisma` :
```prisma
generator client {
  provider      = "prisma-client-js"
  output        = "../src/generated/prisma"
  binaryTargets = ["native", "debian-openssl-3.0.x"]
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum Role {
  ADMIN
  OPERATOR
  VIEWER
}

model User {
  id           String    @id @default(uuid()) @db.Uuid
  email        String    @unique
  name         String
  role         Role
  passwordHash String
  active       Boolean   @default(true)
  createdAt    DateTime  @default(now())
  updatedAt    DateTime  @updatedAt
  lastLoginAt  DateTime?
}
```

- [ ] **Step 2: Générer la migration initiale et le client**

```bash
cd services/auth
npm install
mkdir -p prisma/migrations/20261025000000_init
npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script > prisma/migrations/20261025000000_init/migration.sql
printf 'provider = "postgresql"\n' > prisma/migrations/migration_lock.toml
npx prisma generate
cd ../..
```
Expected : `migration.sql` contient `CREATE TABLE "User"` ; `services/auth/src/generated/prisma/index.d.ts` existe.

- [ ] **Step 3: Test unitaire du limiteur (échoue)**

`services/auth/test/rate-limiter.test.ts` :
```ts
import { describe, expect, it } from 'vitest';
import { FixedWindowLimiter } from '../src/rate-limiter';

describe('FixedWindowLimiter', () => {
  it('allows max hits per window then blocks, per key', () => {
    let now = 0;
    const l = new FixedWindowLimiter(2, 60_000, () => now);
    expect(l.hit('a')).toBe(true);
    expect(l.hit('a')).toBe(true);
    expect(l.hit('a')).toBe(false);
    expect(l.hit('b')).toBe(true);
    now = 60_001;
    expect(l.hit('a')).toBe(true);
  });
});
```

- [ ] **Step 4: Global setup Postgres pour les tests d'intégration**

`services/auth/test/global-setup.ts` :
```ts
import { execSync } from 'node:child_process';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import type { TestProject } from 'vitest/node';

let container: StartedPostgreSqlContainer | undefined;

export async function setup(project: TestProject) {
  container = await new PostgreSqlContainer('postgres:16-alpine').start();
  const url = container.getConnectionUri();
  execSync('npx prisma migrate deploy', { env: { ...process.env, DATABASE_URL: url }, stdio: 'inherit' });
  project.provide('databaseUrl', url);
}

export async function teardown() {
  await container?.stop();
}

declare module 'vitest' {
  export interface ProvidedContext {
    databaseUrl: string;
  }
}
```

- [ ] **Step 5: Test d'intégration du service (échoue)**

`services/auth/test/auth.test.ts` :
```ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { inject } from 'vitest';
import { exportPKCS8, exportSPKI, generateKeyPair, importSPKI, jwtVerify } from 'jose';
import { PrismaClient } from '../src/generated/prisma';
import { buildAuthApp } from '../src/app';
import { hashPassword } from '../src/passwords';
import { createTokenSigner } from '../src/tokens';
import { FixedWindowLimiter } from '../src/rate-limiter';

const prisma = new PrismaClient({ datasourceUrl: inject('databaseUrl') });
let publicPem: string;
let privatePem: string;

beforeAll(async () => {
  const { privateKey, publicKey } = await generateKeyPair('RS256', { extractable: true });
  privatePem = await exportPKCS8(privateKey);
  publicPem = await exportSPKI(publicKey);
});
afterAll(async () => { await prisma.$disconnect(); });

beforeEach(async () => {
  await prisma.user.deleteMany();
  await prisma.user.create({
    data: { email: 'op@ccis.mg', name: 'Op', role: 'OPERATOR', passwordHash: await hashPassword('secret123') },
  });
  await prisma.user.create({
    data: { email: 'gone@ccis.mg', name: 'Gone', role: 'VIEWER', active: false, passwordHash: await hashPassword('secret123') },
  });
});

async function app(limiter = new FixedWindowLimiter(100, 60_000)) {
  return buildAuthApp({ prisma, signer: await createTokenSigner(privatePem), limiter, logger: false });
}

const login = (a: Awaited<ReturnType<typeof app>>, email: string, password: string, ip = '10.0.0.1') =>
  a.inject({ method: 'POST', url: '/auth/login', payload: { email, password }, headers: { 'x-forwarded-for': ip } });

describe('POST /auth/login', () => {
  it('returns a verifiable RS256 token and the public user', async () => {
    const res = await login(await app(), 'OP@ccis.mg', 'secret123');
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.user).toMatchObject({ email: 'op@ccis.mg', role: 'OPERATOR' });
    expect(body.user.passwordHash).toBeUndefined();
    const { payload } = await jwtVerify(body.accessToken, await importSPKI(publicPem, 'RS256'), { issuer: 'ccis-auth' });
    expect(payload.sub).toBe(body.user.id);
    expect(payload.role).toBe('OPERATOR');
    expect((payload.exp ?? 0) - (payload.iat ?? 0)).toBe(12 * 3600);
    const user = await prisma.user.findUniqueOrThrow({ where: { email: 'op@ccis.mg' } });
    expect(user.lastLoginAt).not.toBeNull();
  });

  it('same 401 message for wrong password, unknown email and inactive account', async () => {
    const a = await app();
    for (const [email, pw] of [['op@ccis.mg', 'nope'], ['who@ccis.mg', 'secret123'], ['gone@ccis.mg', 'secret123']]) {
      const res = await login(a, email, pw);
      expect(res.statusCode).toBe(401);
      expect(res.json()).toMatchObject({ code: 'UNAUTHORIZED', error: 'Email ou mot de passe incorrect.' });
    }
  });

  it('400 on malformed body', async () => {
    const res = await (await app()).inject({ method: 'POST', url: '/auth/login', payload: { email: 'x' } });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('VALIDATION');
  });

  it('429 after 5 attempts per minute for the same email, even from different IPs', async () => {
    const a = await app(new FixedWindowLimiter(5, 60_000));
    for (let i = 0; i < 5; i++) await login(a, 'op@ccis.mg', 'nope', `10.0.0.${i}`);
    const res = await login(a, 'op@ccis.mg', 'secret123', '10.0.0.99');
    expect(res.statusCode).toBe(429);
    expect(res.json().code).toBe('RATE_LIMITED');
  });

  it('429 after 5 attempts per minute from the same IP, even for different emails', async () => {
    const a = await app(new FixedWindowLimiter(5, 60_000));
    for (let i = 0; i < 5; i++) await login(a, `u${i}@ccis.mg`, 'nope', '10.9.9.9');
    expect((await login(a, 'op@ccis.mg', 'secret123', '10.9.9.9')).statusCode).toBe(429);
  });
});

describe('GET /auth/me', () => {
  it('returns the user identified by the gateway headers', async () => {
    const user = await prisma.user.findUniqueOrThrow({ where: { email: 'op@ccis.mg' } });
    const res = await (await app()).inject({ url: '/auth/me', headers: { 'x-user-id': user.id, 'x-user-role': 'OPERATOR' } });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ id: user.id, email: 'op@ccis.mg', name: 'Op', role: 'OPERATOR' });
  });

  it('401 without identity or for an inactive user', async () => {
    const a = await app();
    expect((await a.inject({ url: '/auth/me' })).statusCode).toBe(401);
    const gone = await prisma.user.findUniqueOrThrow({ where: { email: 'gone@ccis.mg' } });
    expect((await a.inject({ url: '/auth/me', headers: { 'x-user-id': gone.id, 'x-user-role': 'VIEWER' } })).statusCode).toBe(401);
  });
});
```

- [ ] **Step 6: Vérifier l'échec**

Run: `npm test -w @ccis/auth-service`
Expected : FAIL, modules `../src/rate-limiter`, `../src/app`… introuvables.

- [ ] **Step 7: Implémenter**

`services/auth/src/rate-limiter.ts` :
```ts
export class FixedWindowLimiter {
  private readonly windows = new Map<string, { start: number; count: number }>();

  constructor(
    private readonly max: number,
    private readonly windowMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  hit(key: string): boolean {
    const t = this.now();
    const w = this.windows.get(key);
    if (!w || t - w.start > this.windowMs) {
      this.windows.set(key, { start: t, count: 1 });
      if (this.windows.size > 10_000) this.sweep(t);
      return true;
    }
    w.count++;
    return w.count <= this.max;
  }

  private sweep(t: number): void {
    for (const [k, w] of this.windows) if (t - w.start > this.windowMs) this.windows.delete(k);
  }
}
```

`services/auth/src/passwords.ts` :
```ts
import argon2 from 'argon2';

export function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, { type: argon2.argon2id });
}

export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}
```

`services/auth/src/tokens.ts` :
```ts
import { importPKCS8, SignJWT } from 'jose';
import type { Role } from '@ccis/contracts';

export const TOKEN_ISSUER = 'ccis-auth';

export interface TokenSigner {
  sign(user: { id: string; role: Role }): Promise<string>;
}

export async function createTokenSigner(privateKeyPem: string): Promise<TokenSigner> {
  const key = await importPKCS8(privateKeyPem, 'RS256');
  return {
    sign: (user) =>
      new SignJWT({ role: user.role })
        .setProtectedHeader({ alg: 'RS256' })
        .setSubject(user.id)
        .setIssuer(TOKEN_ISSUER)
        .setIssuedAt()
        .setExpirationTime('12h')
        .sign(key),
  };
}
```

`services/auth/src/app.ts` :
```ts
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createApp, errors, requireRole } from '@ccis/service-kit';
import type { PrismaClient, User } from './generated/prisma';
import { verifyPassword } from './passwords';
import { FixedWindowLimiter } from './rate-limiter';
import type { TokenSigner } from './tokens';

const loginBody = z.object({ email: z.string().email(), password: z.string().min(1) });

function publicUser(u: User) {
  return { id: u.id, email: u.email, name: u.name, role: u.role };
}

export interface AuthDeps {
  prisma: PrismaClient;
  signer: TokenSigner;
  limiter?: FixedWindowLimiter;
  logger?: boolean;
}

export function buildAuthApp(deps: AuthDeps): FastifyInstance {
  const limiter = deps.limiter ?? new FixedWindowLimiter(5, 60_000);
  const app = createApp({
    service: 'auth-service',
    logger: deps.logger,
    checks: { database: async () => { await deps.prisma.$queryRaw`SELECT 1`; } },
  });

  app.post('/auth/login', async (req) => {
    const { email, password } = loginBody.parse(req.body);
    const normalized = email.trim().toLowerCase();
    // Count both keys on every attempt (no short-circuit).
    const ipOk = limiter.hit(`ip:${req.ip}`);
    const emailOk = limiter.hit(`email:${normalized}`);
    if (!ipOk || !emailOk) throw errors.rateLimited('Trop de tentatives, réessayez dans une minute.');

    const user = await deps.prisma.user.findUnique({ where: { email: normalized } });
    if (!user || !user.active || !(await verifyPassword(user.passwordHash, password))) {
      throw errors.unauthorized('Email ou mot de passe incorrect.');
    }
    await deps.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    return { accessToken: await deps.signer.sign(user), user: publicUser(user) };
  });

  app.get('/auth/me', { preHandler: requireRole('VIEWER') }, async (req) => {
    const user = await deps.prisma.user.findUnique({ where: { id: req.identity!.userId } });
    if (!user || !user.active) throw errors.unauthorized('Utilisateur inconnu ou désactivé.');
    return publicUser(user);
  });

  return app;
}
```

`services/auth/src/config.ts` :
```ts
import { readFileSync } from 'node:fs';

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Variable d'environnement manquante : ${name}`);
  return v;
}

export const config = {
  port: Number(process.env.PORT ?? 4001),
  host: process.env.HOST ?? '0.0.0.0',
  privateKeyPem: () => readFileSync(required('JWT_PRIVATE_KEY_FILE'), 'utf8'),
};
```

`services/auth/src/main.ts` :
```ts
import { PrismaClient } from './generated/prisma';
import { buildAuthApp } from './app';
import { config } from './config';
import { createTokenSigner } from './tokens';

const prisma = new PrismaClient();
const app = buildAuthApp({ prisma, signer: await createTokenSigner(config.privateKeyPem()) });

const shutdown = async () => {
  await app.close();
  await prisma.$disconnect();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

await app.listen({ port: config.port, host: config.host });
```

`services/auth/scripts/seed.ts` :
```ts
import { PrismaClient } from '../src/generated/prisma';
import { hashPassword } from '../src/passwords';

// Demo accounts (development only).
const USERS = [
  { email: 'admin@ccis.mg', password: 'admin123', name: 'Administrateur', role: 'ADMIN' as const },
  { email: 'operateur@ccis.mg', password: 'operateur123', name: 'Opérateur Yard', role: 'OPERATOR' as const },
  { email: 'lecteur@ccis.mg', password: 'lecteur123', name: 'Consultation', role: 'VIEWER' as const },
];

const prisma = new PrismaClient();
for (const u of USERS) {
  const passwordHash = await hashPassword(u.password);
  await prisma.user.upsert({
    where: { email: u.email },
    update: { name: u.name, role: u.role, passwordHash, active: true },
    create: { email: u.email, name: u.name, role: u.role, passwordHash },
  });
  console.log(`  ${u.role.padEnd(8)} ${u.email}`);
}
await prisma.$disconnect();
```

- [ ] **Step 8: Vérifier le succès et le typage**

Run: `npm test -w @ccis/auth-service && npm run typecheck -w @ccis/auth-service`
Expected : 8 tests PASS, aucune erreur TypeScript.

- [ ] **Step 9: Commit**

```bash
git add services/auth package-lock.json
git commit -m "feat(auth): auth-service with argon2, RS256 JWT and login rate limiting"
```

---

### Task 7: `yard-service` — schéma, migration et règles métier pures

**Files:**
- Create: `services/yard/package.json`, `tsconfig.json`, `vitest.config.ts`, `prisma/schema.prisma`, `prisma/migrations/migration_lock.toml`, `prisma/migrations/20261025000000_init/migration.sql`, `src/domain/rules.ts`, `src/domain/reefer.ts`, `test/global-setup.ts`, `test/rules.test.ts`

**Interfaces:**
- Consumes : `ContainerType` (contracts).
- Produces :
  - Tables `Zone`, `Container`, `ReeferState`, `Movement`, `outbox` ; index uniques partiels `container_no_present`, `container_slot_present`
  - `MAX_TIER = 3`, `ISO_CODES: Record<ContainerType, string>`, `CONTAINER_NO_RE`, `ZONE_ID_RE`
  - `sizeOf(type: string): 20 | 40`, `isReefer(type: string): boolean`
  - `posLabel(zoneId: string, row: number, col: number): string`
  - `placementError(stack: { type: string }[], type: string): string | null`
  - `zoneDimsError(rows: number, cols: number): string | null`
  - `planCompaction(zone: { rows: number; cols: number }, cts: { id: string; type: string; plannedExitDate: Date | null }[]): Map<string, { row: number; col: number; tier: number }> | null` (`null` si la zone déborde)
  - `normalizeContainerNo(raw: string): string`
  - `REEFER_COMMODITIES`, `defaultReefer(now: Date, random?: () => number): ReeferDefaults`, `computeTempAlert(r: { powerStatus: string; currentTemp: number; tempMin: number; tempMax: number }): boolean`

- [ ] **Step 1: Squelette et schéma**

`services/yard/package.json` :
```json
{
  "name": "@ccis/yard-service",
  "private": true,
  "type": "module",
  "scripts": {
    "generate": "prisma generate",
    "start": "prisma migrate deploy && tsx src/main.ts",
    "dev": "tsx watch src/main.ts",
    "seed": "tsx scripts/seed.ts",
    "test": "vitest run",
    "typecheck": "tsc -p tsconfig.json"
  },
  "dependencies": {
    "@ccis/contracts": "*",
    "@ccis/messaging": "*",
    "@ccis/service-kit": "*",
    "@prisma/client": "6.19.3",
    "zod": "3.25.76"
  },
  "devDependencies": {
    "prisma": "6.19.3",
    "@testcontainers/postgresql": "11.14.0"
  }
}
```
`services/yard/tsconfig.json` : `{ "extends": "../../tsconfig.base.json", "include": ["src", "test", "scripts", "vitest.config.ts"] }`
`services/yard/vitest.config.ts` :
```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { globalSetup: ['./test/global-setup.ts'], fileParallelism: false, testTimeout: 30_000, hookTimeout: 180_000 },
});
```
`services/yard/test/global-setup.ts` : contenu **identique** à `services/auth/test/global-setup.ts` (Task 6, Step 4) :
```ts
import { execSync } from 'node:child_process';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import type { TestProject } from 'vitest/node';

let container: StartedPostgreSqlContainer | undefined;

export async function setup(project: TestProject) {
  container = await new PostgreSqlContainer('postgres:16-alpine').start();
  const url = container.getConnectionUri();
  execSync('npx prisma migrate deploy', { env: { ...process.env, DATABASE_URL: url }, stdio: 'inherit' });
  project.provide('databaseUrl', url);
}

export async function teardown() {
  await container?.stop();
}

declare module 'vitest' {
  export interface ProvidedContext {
    databaseUrl: string;
  }
}
```

`services/yard/prisma/schema.prisma` :
```prisma
generator client {
  provider      = "prisma-client-js"
  output        = "../src/generated/prisma"
  binaryTargets = ["native", "debian-openssl-3.0.x"]
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum ContainerType {
  EMPTY_20
  EMPTY_40
  FULL_20
  FULL_40
  REEFER
  REEFER_FULL
}

enum ContainerStatus {
  PRESENT
  DEPARTED
}

enum CustomsStatus {
  RELEASED
  HOLD
}

enum MovementType {
  ARRIVAL
  DEPARTURE
  TRANSFER
  MOVE
  COMPACT
}

model Zone {
  id        String   @id
  label     String
  rows      Int
  cols      Int
  version   Int      @default(1)
  createdAt DateTime @default(now())
}

// zoneId is not a foreign key: departed containers keep their last position
// even after the zone is deleted. Zone existence is enforced by the service.
// Partial unique indexes (present containers only) live in the migration SQL:
//   container_no_present   ("containerNo")
//   container_slot_present ("zoneId", "row", "col", "tier")
// Check every future `prisma migrate dev` output does not drop them.
model Container {
  id              String          @id @default(uuid()) @db.Uuid
  containerNo     String
  type            ContainerType
  isoCode         String
  client          String?
  weightKg        Int?
  zoneId          String
  row             Int
  col             Int
  tier            Int
  entryDate       DateTime        @default(now())
  plannedExitDate DateTime?
  exitDate        DateTime?
  customsStatus   CustomsStatus   @default(RELEASED)
  status          ContainerStatus @default(PRESENT)
  version         Int             @default(1)
  reefer          ReeferState?
  movements       Movement[]

  @@index([zoneId, row, col])
  @@index([containerNo])
}

model ReeferState {
  containerId   String    @id @db.Uuid
  container     Container @relation(fields: [containerId], references: [id], onDelete: Cascade)
  commodity     String
  setPoint      Float
  tempMin       Float
  tempMax       Float
  powerStatus   String
  ventSetting   String
  humidity      String
  currentTemp   Float
  lastReadingAt DateTime
  alert         Boolean   @default(false)
  alertReason   String?
}

model Movement {
  id          String       @id @default(uuid()) @db.Uuid
  type        MovementType
  containerId String       @db.Uuid
  container   Container    @relation(fields: [containerId], references: [id])
  fromZoneId  String?
  fromRow     Int?
  fromCol     Int?
  fromTier    Int?
  toZoneId    String?
  toRow       Int?
  toCol       Int?
  toTier      Int?
  userId      String?
  createdAt   DateTime     @default(now())
  undoneAt    DateTime?
  undoneBy    String?

  @@index([createdAt(sort: Desc)])
}

model OutboxMessage {
  id          String    @id @db.Uuid
  exchange    String
  routingKey  String
  payload     Json
  createdAt   DateTime  @default(now())
  publishedAt DateTime?

  @@index([publishedAt, createdAt])
  @@map("outbox")
}
```

- [ ] **Step 2: Générer la migration, y ajouter les index partiels, générer le client**

```bash
cd services/yard
npm install
mkdir -p prisma/migrations/20261025000000_init
npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script > prisma/migrations/20261025000000_init/migration.sql
cat >> prisma/migrations/20261025000000_init/migration.sql <<'SQL'

-- Present containers only: a container number and a physical slot can each be
-- held by at most one present container. Arbitrates concurrent writes.
CREATE UNIQUE INDEX "container_no_present" ON "Container"("containerNo") WHERE "status" = 'PRESENT';
CREATE UNIQUE INDEX "container_slot_present" ON "Container"("zoneId", "row", "col", "tier") WHERE "status" = 'PRESENT';
SQL
printf 'provider = "postgresql"\n' > prisma/migrations/migration_lock.toml
npx prisma generate
cd ../..
```
Expected : `migration.sql` se termine par les deux `CREATE UNIQUE INDEX`.

- [ ] **Step 3: Écrire le test des règles (échoue)**

`services/yard/test/rules.test.ts` :
```ts
import { describe, expect, it } from 'vitest';
import {
  MAX_TIER, normalizeContainerNo, placementError, planCompaction, posLabel, sizeOf, zoneDimsError,
} from '../src/domain/rules';
import { computeTempAlert, defaultReefer } from '../src/domain/reefer';

describe('sizeOf', () => {
  it('only types containing 20 are 20 feet (REEFER counts as 40)', () => {
    expect(sizeOf('EMPTY_20')).toBe(20);
    expect(sizeOf('FULL_40')).toBe(40);
    expect(sizeOf('REEFER')).toBe(40);
    expect(sizeOf('REEFER_FULL')).toBe(40);
  });
});

describe('placementError', () => {
  it('accepts an empty stack', () => {
    expect(placementError([], 'FULL_40')).toBeNull();
  });
  it('refuses a full stack', () => {
    const full = Array.from({ length: MAX_TIER }, () => ({ type: 'FULL_20' }));
    expect(placementError(full, 'FULL_20')).toMatch(/Pile pleine/);
  });
  it("refuses a 40' on a 20'", () => {
    expect(placementError([{ type: 'EMPTY_20' }], 'FULL_40')).toMatch(/40' .* 20'/);
  });
  it("accepts a 20' on a 40'", () => {
    expect(placementError([{ type: 'FULL_40' }], 'EMPTY_20')).toBeNull();
  });
});

describe('zoneDimsError', () => {
  it('bounds rows 1-30 and cols 1-40', () => {
    expect(zoneDimsError(1, 1)).toBeNull();
    expect(zoneDimsError(30, 40)).toBeNull();
    expect(zoneDimsError(0, 5)).not.toBeNull();
    expect(zoneDimsError(5, 41)).not.toBeNull();
    expect(zoneDimsError(2.5, 5)).not.toBeNull();
  });
});

describe('normalizeContainerNo', () => {
  it('uppercases and strips spaces', () => {
    expect(normalizeContainerNo(' mscu 123 4567 ')).toBe('MSCU1234567');
  });
});

describe('posLabel', () => {
  it('formats zone, bay and row 1-based', () => {
    expect(posLabel('A', 0, 9)).toBe('A-Bay10-R01');
  });
});

describe('planCompaction', () => {
  const d = (s: string) => new Date(s);
  it("puts 40' first, latest exit at the bottom, fills 3 high", () => {
    const plan = planCompaction({ rows: 2, cols: 2 }, [
      { id: 'a20', type: 'FULL_20', plannedExitDate: d('2026-11-01') },
      { id: 'b40', type: 'FULL_40', plannedExitDate: d('2026-11-05') },
      { id: 'c40', type: 'EMPTY_40', plannedExitDate: d('2026-11-10') },
      { id: 'd20', type: 'EMPTY_20', plannedExitDate: d('2026-11-20') },
    ])!;
    expect(plan.get('c40')).toEqual({ row: 0, col: 0, tier: 1 });
    expect(plan.get('b40')).toEqual({ row: 0, col: 0, tier: 2 });
    expect(plan.get('d20')).toEqual({ row: 0, col: 1, tier: 1 });
    expect(plan.get('a20')).toEqual({ row: 0, col: 1, tier: 2 });
  });
  it('returns null when containers do not fit', () => {
    const cts = Array.from({ length: 4 }, (_, i) => ({ id: `x${i}`, type: 'FULL_20', plannedExitDate: null }));
    expect(planCompaction({ rows: 1, cols: 1 }, cts)).toBeNull();
  });
});

describe('reefer', () => {
  it('defaultReefer stays within its commodity range', () => {
    const r = defaultReefer(new Date('2026-10-25T00:00:00Z'), () => 0.5);
    expect(r.currentTemp).toBeGreaterThanOrEqual(r.tempMin);
    expect(r.currentTemp).toBeLessThanOrEqual(r.tempMax);
    expect(r.alert).toBe(false);
  });
  it('computeTempAlert: power off or out of range', () => {
    const base = { powerStatus: 'on', currentTemp: 5, tempMin: 2, tempMax: 8 };
    expect(computeTempAlert(base)).toBe(false);
    expect(computeTempAlert({ ...base, currentTemp: 9 })).toBe(true);
    expect(computeTempAlert({ ...base, powerStatus: 'off' })).toBe(true);
  });
});
```

- [ ] **Step 4: Vérifier l'échec**

Run: `npm test -w @ccis/yard-service -- rules`
Expected : FAIL, `Cannot find module '../src/domain/rules'`.

- [ ] **Step 5: Implémenter**

`services/yard/src/domain/rules.ts` :
```ts
import type { ContainerType } from '@ccis/contracts';

export const MAX_TIER = 3;
export const CONTAINER_NO_RE = /^[A-Z]{4}\d{7}$/;
export const ZONE_ID_RE = /^[A-Z0-9]{1,4}$/;

export const ISO_CODES: Record<ContainerType, string> = {
  EMPTY_20: '22G0',
  EMPTY_40: '42G0',
  FULL_20: '22G1',
  FULL_40: '42G1',
  REEFER: '22R0',
  REEFER_FULL: '42R1',
};

// Mirrors the frontend rule (web/src/data/rules.js getSize).
export function sizeOf(type: string): 20 | 40 {
  return type.includes('20') ? 20 : 40;
}

export function isReefer(type: string): boolean {
  return type.startsWith('REEFER');
}

export function posLabel(zoneId: string, row: number, col: number): string {
  return `${zoneId}-Bay${String(col + 1).padStart(2, '0')}-R${String(row + 1).padStart(2, '0')}`;
}

export function normalizeContainerNo(raw: string): string {
  return raw.replace(/\s+/g, '').toUpperCase();
}

export function placementError(stack: { type: string }[], type: string): string | null {
  if (stack.length >= MAX_TIER) return `Pile pleine (${MAX_TIER} niveaux max)`;
  if (sizeOf(type) === 40 && stack.some((c) => sizeOf(c.type) === 20)) {
    return "Interdit : un 40' ne peut pas être posé sur un 20'";
  }
  return null;
}

export function zoneDimsError(rows: number, cols: number): string | null {
  const ok = Number.isInteger(rows) && Number.isInteger(cols) && rows >= 1 && rows <= 30 && cols >= 1 && cols <= 40;
  return ok ? null : 'Dimensions invalides (rangées 1–30, baies 1–40).';
}

export interface Slot {
  row: number;
  col: number;
  tier: number;
}

// Same strategy as the prototype: 40' first then 20', each group starting on a
// fresh slot (a 40' never lands on a 20'); within a group the latest exit date
// goes to the bottom so the earliest departures stay on top.
export function planCompaction(
  zone: { rows: number; cols: number },
  cts: { id: string; type: string; plannedExitDate: Date | null }[],
): Map<string, Slot> | null {
  const exitKey = (c: { plannedExitDate: Date | null }) => c.plannedExitDate?.toISOString() ?? '';
  const byExitDesc = (a: { plannedExitDate: Date | null }, b: { plannedExitDate: Date | null }) =>
    exitKey(b).localeCompare(exitKey(a));
  const groups = [
    cts.filter((c) => sizeOf(c.type) === 40).sort(byExitDesc),
    cts.filter((c) => sizeOf(c.type) === 20).sort(byExitDesc),
  ];
  const plan = new Map<string, Slot>();
  const totalSlots = zone.rows * zone.cols;
  let slot = 0;
  for (const group of groups) {
    for (let i = 0; i < group.length; i += MAX_TIER) {
      if (slot >= totalSlots) return null;
      group.slice(i, i + MAX_TIER).forEach((ct, k) => {
        plan.set(ct.id, { row: Math.floor(slot / zone.cols), col: slot % zone.cols, tier: k + 1 });
      });
      slot++;
    }
  }
  return plan;
}
```

`services/yard/src/domain/reefer.ts` :
```ts
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
  const r = {
    commodity: c.name,
    setPoint: c.setPoint,
    tempMin: c.min,
    tempMax: c.max,
    currentTemp,
    powerStatus: 'on' as const,
    ventSetting: `${[0, 10, 15, 25][Math.floor(random() * 4)]} CBM/H`,
    humidity: `${Math.floor(60 + random() * 30)}%`,
    lastReadingAt: now,
    alert: false,
  };
  r.alert = computeTempAlert(r);
  return r;
}
```

- [ ] **Step 6: Vérifier le succès**

Run: `npm test -w @ccis/yard-service -- rules`
Expected : 12 tests PASS.

- [ ] **Step 7: Commit**

```bash
git add services/yard package-lock.json
git commit -m "feat(yard): prisma schema with partial unique indexes, pure yard rules"
```

---

### Task 8: `yard-service` — opérations transactionnelles avec outbox

**Files:**
- Create: `services/yard/src/locks.ts`, `src/events.ts`, `src/yard-service.ts`, `test/helpers.ts`, `test/yard-service.test.ts`, `test/outbox-store.test.ts`

**Interfaces:**
- Consumes : règles (Task 7), `createEnvelope`, `exchangeFor`, `Actor`, `ContainerSnapshot`, `Position`, `EventType`, `EventData` (contracts), `errors` (service-kit), `prismaOutboxStore`, `PrismaLike` (messaging).
- Produces :
  - `interface Ctx { actor: Actor; correlationId: string }`
  - `type ContainerWithReefer = Container & { reefer: ReeferState | null }`
  - `class YardService { constructor(prisma: PrismaClient, onCommitted?: () => void) }` avec :
    - `listZones(): Promise<Zone[]>`
    - `createZone(input: { id: string; label?: string; rows: number; cols: number }, ctx: Ctx): Promise<Zone>`
    - `updateZone(id: string, input: { label?: string; rows?: number; cols?: number; expectedVersion?: number }, ctx: Ctx): Promise<Zone>`
    - `deleteZone(id: string, ctx: Ctx): Promise<void>`
    - `listContainers(filter: { zoneId?: string; type?: string; q?: string }): Promise<ContainerWithReefer[]>`
    - `getContainer(idOrNo: string): Promise<ContainerWithReefer>`
    - `arrival(input: ArrivalInput, ctx: Ctx): Promise<ContainerWithReefer>` avec `ArrivalInput = { containerNo?: string; type: ContainerType; client?: string; weightKg?: number; zoneId: string; row?: number; col?: number; plannedExitDate?: string }`
    - `departure(id: string, input: { expectedVersion?: number }, ctx: Ctx): Promise<ContainerWithReefer>`
    - `transfer(id: string, input: { targetZoneId: string; expectedVersion?: number }, ctx: Ctx): Promise<ContainerWithReefer>`
    - `move(id: string, input: { toZoneId: string; toRow: number; toCol: number; expectedVersion?: number }, ctx: Ctx): Promise<ContainerWithReefer>`
    - `undoMovement(movementId: string, ctx: Ctx): Promise<ContainerWithReefer>`
    - `compactZone(zoneId: string, ctx: Ctx): Promise<number>` ; `compactAll(ctx: Ctx): Promise<number>`
    - `updateReefer(id: string, patch: ReeferPatch, ctx: Ctx): Promise<ContainerWithReefer>`
    - `listMovements(take: number): Promise<(Movement & { container: Container })[]>`
  - Événements écrits dans `outbox` : `yard.container.{arrived,departed,moved,transferred,relocated}`, `yard.zone.{created,updated,deleted}`, `yard.reefer.configured`.

- [ ] **Step 1: Helpers de test**

`services/yard/test/helpers.ts` :
```ts
import { inject } from 'vitest';
import { PrismaClient } from '../src/generated/prisma';
import type { Ctx } from '../src/yard-service';

export const prisma = new PrismaClient({ datasourceUrl: inject('databaseUrl') });

export const operator: Ctx = { actor: { userId: 'u-op', role: 'OPERATOR' }, correlationId: 'corr-test' };

export async function resetDb(): Promise<void> {
  await prisma.$executeRawUnsafe('TRUNCATE "Movement", "ReeferState", "Container", "Zone", outbox CASCADE');
}

export async function outboxTypes(): Promise<string[]> {
  const rows = await prisma.outboxMessage.findMany({ orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] });
  return rows.map((r) => r.routingKey);
}
```

- [ ] **Step 2: Écrire les tests du service (échouent)**

`services/yard/test/yard-service.test.ts` :
```ts
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { parseEnvelope } from '@ccis/contracts';
import { AppError } from '@ccis/service-kit';
import { YardService } from '../src/yard-service';
import { operator, outboxTypes, prisma, resetDb } from './helpers';

let kicks = 0;
const svc = new YardService(prisma, () => { kicks++; });

async function expectCode(p: Promise<unknown>, code: string, msg?: RegExp) {
  const err = await p.then(() => null, (e: unknown) => e);
  expect(err).toBeInstanceOf(AppError);
  expect((err as AppError).code).toBe(code);
  if (msg) expect((err as AppError).message).toMatch(msg);
}

beforeEach(async () => {
  await resetDb();
  kicks = 0;
  await svc.createZone({ id: 'A', label: 'Zone A', rows: 2, cols: 3 }, operator);
  await svc.createZone({ id: 'B', label: 'Zone B', rows: 2, cols: 2 }, operator);
});
afterAll(async () => { await prisma.$disconnect(); });

const arrive = (type: 'FULL_20' | 'FULL_40' | 'EMPTY_20' | 'REEFER', zoneId = 'A', row?: number, col?: number, extra = {}) =>
  svc.arrival({ type, zoneId, row, col, ...extra }, operator);

describe('arrival', () => {
  it('auto-places, records a movement and a valid outbox event, then kicks the relay', async () => {
    const ct = await arrive('FULL_20');
    expect(ct).toMatchObject({ zoneId: 'A', row: 0, col: 0, tier: 1, version: 1, status: 'PRESENT', isoCode: '22G1' });
    expect(ct.containerNo).toMatch(/^[A-Z]{4}\d{7}$/);
    const mv = await prisma.movement.findMany();
    expect(mv).toHaveLength(1);
    expect(mv[0]).toMatchObject({ type: 'ARRIVAL', toZoneId: 'A', toTier: 1, userId: 'u-op' });
    const out = await prisma.outboxMessage.findMany({ where: { routingKey: 'yard.container.arrived' } });
    expect(out).toHaveLength(1);
    const env = parseEnvelope(out[0].payload);
    expect(env).toMatchObject({ aggregateId: ct.id, aggregateVersion: 1, correlationId: 'corr-test', source: 'yard-service' });
    expect(out[0].exchange).toBe('yard.events');
    expect(kicks).toBeGreaterThan(0);
  });

  it('normalizes container number (lowercase, spaces)', async () => {
    const ct = await arrive('FULL_20', 'A', 0, 0, { containerNo: ' mscu 1234567 ' });
    expect(ct.containerNo).toBe('MSCU1234567');
  });

  it('rejects an invalid number and a number already present', async () => {
    await expectCode(arrive('FULL_20', 'A', 0, 0, { containerNo: 'ABC' }), 'VALIDATION');
    await arrive('FULL_20', 'A', 0, 0, { containerNo: 'MSCU1234567' });
    await expectCode(arrive('FULL_20', 'A', 0, 1, { containerNo: 'MSCU1234567' }), 'RULE_VIOLATION', /déjà présent/);
  });

  it("rejects a 40' on a 20' and a full stack", async () => {
    await arrive('FULL_20', 'A', 0, 0);
    await expectCode(arrive('FULL_40', 'A', 0, 0), 'RULE_VIOLATION', /40'/);
    await arrive('FULL_20', 'A', 0, 0);
    await arrive('FULL_20', 'A', 0, 0);
    await expectCode(arrive('FULL_20', 'A', 0, 0), 'RULE_VIOLATION', /Pile pleine/);
  });

  it('rejects out-of-bounds positions and unknown zones', async () => {
    await expectCode(arrive('FULL_20', 'A', 5, 0), 'VALIDATION');
    await expectCode(arrive('FULL_20', 'Z'), 'NOT_FOUND');
  });

  it('creates reefer state and a reefer.configured event for reefers', async () => {
    const ct = await arrive('REEFER');
    expect(ct.reefer).not.toBeNull();
    expect(await outboxTypes()).toContain('yard.reefer.configured');
  });

  it('concurrent arrivals on a 2-high stack: one succeeds, one gets "Pile pleine", no duplicate tier', async () => {
    await arrive('FULL_20', 'A', 1, 1);
    await arrive('FULL_20', 'A', 1, 1);
    const results = await Promise.allSettled([arrive('FULL_20', 'A', 1, 1), arrive('FULL_20', 'A', 1, 1)]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
    expect((rejected.reason as AppError).code).toBe('RULE_VIOLATION');
    const tiers = (await prisma.container.findMany({ where: { zoneId: 'A', row: 1, col: 1 } })).map((c) => c.tier).sort();
    expect(tiers).toEqual([1, 2, 3]);
  });

  it('the database refuses two present containers in the same slot', async () => {
    const ct = await arrive('FULL_20', 'A', 0, 0);
    await expect(
      prisma.container.create({
        data: { containerNo: 'TCLU7654321', type: 'FULL_20', isoCode: '22G1', zoneId: 'A', row: 0, col: 0, tier: ct.tier },
      }),
    ).rejects.toThrow();
  });
});

describe('move', () => {
  it('moves the top container and emits yard.container.moved with the new version', async () => {
    const ct = await arrive('FULL_20', 'A', 0, 0);
    const moved = await svc.move(ct.id, { toZoneId: 'B', toRow: 1, toCol: 1, expectedVersion: 1 }, operator);
    expect(moved).toMatchObject({ zoneId: 'B', row: 1, col: 1, tier: 1, version: 2 });
    const env = parseEnvelope((await prisma.outboxMessage.findFirstOrThrow({ where: { routingKey: 'yard.container.moved' } })).payload);
    expect(env.aggregateVersion).toBe(2);
  });

  it('refuses to move a container that is not on top', async () => {
    const bottom = await arrive('FULL_20', 'A', 0, 0);
    await arrive('FULL_20', 'A', 0, 0);
    await expectCode(svc.move(bottom.id, { toZoneId: 'A', toRow: 1, toCol: 0 }, operator), 'RULE_VIOLATION', /sommet/);
  });

  it('VERSION_CONFLICT when expectedVersion is stale', async () => {
    const ct = await arrive('FULL_20', 'A', 0, 0);
    await svc.move(ct.id, { toZoneId: 'A', toRow: 0, toCol: 1 }, operator);
    await expectCode(svc.move(ct.id, { toZoneId: 'A', toRow: 0, toCol: 2, expectedVersion: 1 }, operator), 'VERSION_CONFLICT');
  });

  it('refuses a move to the same slot', async () => {
    const ct = await arrive('FULL_20', 'A', 0, 0);
    await expectCode(svc.move(ct.id, { toZoneId: 'A', toRow: 0, toCol: 0 }, operator), 'VALIDATION');
  });
});

describe('departure', () => {
  it('marks DEPARTED, frees the number for a later arrival', async () => {
    const ct = await arrive('FULL_20', 'A', 0, 0, { containerNo: 'MSCU1234567' });
    const gone = await svc.departure(ct.id, {}, operator);
    expect(gone).toMatchObject({ status: 'DEPARTED', version: 2 });
    expect(gone.exitDate).not.toBeNull();
    expect(await outboxTypes()).toContain('yard.container.departed');
    expect((await svc.listContainers({})).map((c) => c.id)).not.toContain(ct.id);
    const again = await arrive('FULL_20', 'A', 0, 0, { containerNo: 'MSCU1234567' });
    expect(again.tier).toBe(1);
  });

  it('refuses a departure of a container that is not on top', async () => {
    const bottom = await arrive('FULL_20', 'A', 0, 0);
    await arrive('FULL_20', 'A', 0, 0);
    await expectCode(svc.departure(bottom.id, {}, operator), 'RULE_VIOLATION');
  });
});

describe('transfer', () => {
  it('places in the first free slot of the target zone', async () => {
    const ct = await arrive('FULL_40', 'A', 0, 0);
    const t = await svc.transfer(ct.id, { targetZoneId: 'B' }, operator);
    expect(t).toMatchObject({ zoneId: 'B', row: 0, col: 0, tier: 1 });
    expect(await outboxTypes()).toContain('yard.container.transferred');
  });

  it('refuses a transfer to the same zone', async () => {
    const ct = await arrive('FULL_40', 'A', 0, 0);
    await expectCode(svc.transfer(ct.id, { targetZoneId: 'A' }, operator), 'VALIDATION');
  });
});

describe('undoMovement', () => {
  it('moves the container back, marks the movement undone, refuses a second undo', async () => {
    const ct = await arrive('FULL_20', 'A', 0, 0);
    await svc.move(ct.id, { toZoneId: 'A', toRow: 1, toCol: 2 }, operator);
    const mv = await prisma.movement.findFirstOrThrow({ where: { type: 'MOVE' } });
    const back = await svc.undoMovement(mv.id, operator);
    expect(back).toMatchObject({ zoneId: 'A', row: 0, col: 0, tier: 1, version: 3 });
    expect((await prisma.movement.findUniqueOrThrow({ where: { id: mv.id } })).undoneAt).not.toBeNull();
    expect(await outboxTypes()).toContain('yard.container.relocated');
    await expectCode(svc.undoMovement(mv.id, operator), 'RULE_VIOLATION', /déjà été annulé/);
  });

  it('refuses when the container moved again since', async () => {
    const ct = await arrive('FULL_20', 'A', 0, 0);
    await svc.move(ct.id, { toZoneId: 'A', toRow: 1, toCol: 2 }, operator);
    const mv = await prisma.movement.findFirstOrThrow({ where: { type: 'MOVE' } });
    await svc.move(ct.id, { toZoneId: 'B', toRow: 0, toCol: 0 }, operator);
    await expectCode(svc.undoMovement(mv.id, operator), 'RULE_VIOLATION');
  });
});

describe('compactZone', () => {
  it("packs 40' first, emits relocated only for containers that moved", async () => {
    const a = await arrive('FULL_40', 'A', 0, 0, { plannedExitDate: '2026-11-10' });
    const b = await arrive('FULL_20', 'A', 1, 2, { plannedExitDate: '2026-11-01' });
    const count = await svc.compactZone('A', operator);
    expect(count).toBe(2);
    const after = await prisma.container.findMany({ where: { zoneId: 'A' } });
    expect(after.find((c) => c.id === a.id)).toMatchObject({ row: 0, col: 0, tier: 1, version: 1 });
    expect(after.find((c) => c.id === b.id)).toMatchObject({ row: 0, col: 1, tier: 1, version: 2 });
    const relocated = await prisma.outboxMessage.findMany({ where: { routingKey: 'yard.container.relocated' } });
    expect(relocated).toHaveLength(1);
    expect(await prisma.movement.count({ where: { type: 'COMPACT' } })).toBe(1);
  });

  it('returns 0 for an empty zone; compactAll sums all zones', async () => {
    expect(await svc.compactZone('B', operator)).toBe(0);
    await arrive('FULL_20', 'A', 1, 1);
    await arrive('FULL_20', 'B', 1, 1);
    expect(await svc.compactAll(operator)).toBe(2);
  });
});

describe('zones', () => {
  it('uppercases the id and refuses duplicates and bad dimensions', async () => {
    const z = await svc.createZone({ id: 'c', rows: 1, cols: 1 }, operator);
    expect(z).toMatchObject({ id: 'C', label: 'Zone C', version: 1 });
    await expectCode(svc.createZone({ id: 'C', rows: 1, cols: 1 }, operator), 'RULE_VIOLATION');
    await expectCode(svc.createZone({ id: 'D', rows: 0, cols: 1 }, operator), 'VALIDATION');
    await expectCode(svc.createZone({ id: 'TOOLONG', rows: 1, cols: 1 }, operator), 'VALIDATION');
  });

  it('refuses to shrink below occupied slots and to delete a non-empty zone', async () => {
    await arrive('FULL_20', 'A', 1, 2);
    await expectCode(svc.updateZone('A', { rows: 1 }, operator), 'RULE_VIOLATION', /réduire/);
    await expectCode(svc.deleteZone('A', operator), 'RULE_VIOLATION', /contient/);
  });

  it('VERSION_CONFLICT on a stale zone version; events for create/update/delete', async () => {
    await svc.updateZone('B', { label: 'Export', expectedVersion: 1 }, operator);
    await expectCode(svc.updateZone('B', { label: 'X', expectedVersion: 1 }, operator), 'VERSION_CONFLICT');
    await svc.deleteZone('B', operator);
    const types = await outboxTypes();
    expect(types.filter((t) => t === 'yard.zone.created')).toHaveLength(2);
    expect(types).toContain('yard.zone.updated');
    expect(types).toContain('yard.zone.deleted');
  });
});

describe('updateReefer', () => {
  it('updates settings, recomputes the alert, emits reefer.configured', async () => {
    const ct = await arrive('REEFER');
    const r = await svc.updateReefer(ct.id, { powerStatus: 'off' }, operator);
    expect(r.reefer).toMatchObject({ powerStatus: 'off', alert: true });
    expect((await outboxTypes()).filter((t) => t === 'yard.reefer.configured')).toHaveLength(2);
  });

  it('refuses on a non-reefer container', async () => {
    const ct = await arrive('FULL_20');
    await expectCode(svc.updateReefer(ct.id, { setPoint: 4 }, operator), 'RULE_VIOLATION');
  });
});
```

`services/yard/test/outbox-store.test.ts` :
```ts
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { prismaOutboxStore, type PrismaLike } from '@ccis/messaging';
import { YardService } from '../src/yard-service';
import { operator, prisma, resetDb } from './helpers';

const store = prismaOutboxStore(prisma as unknown as PrismaLike);

beforeEach(async () => {
  await resetDb();
  await new YardService(prisma).createZone({ id: 'A', rows: 1, cols: 1 }, operator);
});
afterAll(async () => { await prisma.$disconnect(); });

describe('prismaOutboxStore', () => {
  it('hands unpublished rows to publish, then marks them published', async () => {
    const seen: string[] = [];
    const n = await store.claimBatch(10, async (records) => { seen.push(...records.map((r) => r.payload.type)); });
    expect(n).toBe(1);
    expect(seen).toEqual(['yard.zone.created']);
    expect(await prisma.outboxMessage.count({ where: { publishedAt: null } })).toBe(0);
    expect(await store.claimBatch(10, async () => {})).toBe(0);
  });

  it('keeps rows unpublished when publish throws', async () => {
    await expect(store.claimBatch(10, async () => { throw new Error('broker down'); })).rejects.toThrow('broker down');
    expect(await prisma.outboxMessage.count({ where: { publishedAt: null } })).toBe(1);
  });
});
```

- [ ] **Step 3: Vérifier l'échec**

Run: `npm test -w @ccis/yard-service -- yard-service outbox-store`
Expected : FAIL, `Cannot find module '../src/yard-service'`.

- [ ] **Step 4: Implémenter `locks.ts` et `events.ts`**

`services/yard/src/locks.ts` :
```ts
import type { Prisma } from './generated/prisma';

type Tx = Prisma.TransactionClient;

// Transaction-scoped advisory locks. Zones first, then slots, each in sorted
// order, so concurrent transactions always acquire locks in the same order.
// Slot operations take the zone lock in shared mode; operations that scan or
// rewrite a whole zone (compaction, auto-placement, resize, delete) take it
// exclusively.
export async function lockZones(tx: Tx, zones: { zoneId: string; mode: 'shared' | 'exclusive' }[]): Promise<void> {
  const byZone = new Map<string, 'shared' | 'exclusive'>();
  for (const z of zones) {
    if (byZone.get(z.zoneId) !== 'exclusive') byZone.set(z.zoneId, z.mode);
  }
  for (const zoneId of [...byZone.keys()].sort()) {
    const fn = byZone.get(zoneId) === 'exclusive' ? 'pg_advisory_xact_lock' : 'pg_advisory_xact_lock_shared';
    await tx.$queryRawUnsafe(`SELECT 1 AS locked FROM ${fn}(hashtext($1))`, `zone:${zoneId}`);
  }
}

export async function lockSlots(tx: Tx, slots: { zoneId: string; row: number; col: number }[]): Promise<void> {
  const keys = [...new Set(slots.map((s) => `slot:${s.zoneId}:${s.row}:${s.col}`))].sort();
  for (const key of keys) {
    await tx.$queryRawUnsafe('SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtext($1))', key);
  }
}
```

`services/yard/src/events.ts` :
```ts
import { createEnvelope, exchangeFor, type ContainerSnapshot, type EventData, type EventType, type Position } from '@ccis/contracts';
import type { Container, Prisma } from './generated/prisma';
import type { Ctx } from './yard-service';

export function positionOf(c: { zoneId: string; row: number; col: number; tier: number }): Position {
  return { zoneId: c.zoneId, row: c.row, col: c.col, tier: c.tier };
}

export function snapshot(c: Container): ContainerSnapshot {
  return {
    id: c.id,
    containerNo: c.containerNo,
    type: c.type,
    isoCode: c.isoCode,
    client: c.client,
    weightKg: c.weightKg,
    position: positionOf(c),
    entryDate: c.entryDate.toISOString(),
    plannedExitDate: c.plannedExitDate?.toISOString() ?? null,
    customsStatus: c.customsStatus,
    version: c.version,
  };
}

export async function emit<T extends EventType>(
  tx: Prisma.TransactionClient,
  ctx: Ctx,
  type: T,
  data: EventData<T>,
  aggregate: { id: string; version: number },
): Promise<void> {
  const env = createEnvelope(type, data, {
    source: 'yard-service',
    correlationId: ctx.correlationId,
    aggregateId: aggregate.id,
    aggregateVersion: aggregate.version,
    actor: ctx.actor,
  });
  await tx.outboxMessage.create({
    data: { id: env.id, exchange: exchangeFor(type), routingKey: type, payload: env as unknown as Prisma.InputJsonValue },
  });
}
```

- [ ] **Step 5: Implémenter `yard-service.ts`**

`services/yard/src/yard-service.ts` :
```ts
import type { Actor, ContainerType } from '@ccis/contracts';
import { errors } from '@ccis/service-kit';
import { Prisma, type Container, type Movement, type PrismaClient, type ReeferState, type Zone } from './generated/prisma';
import { emit, positionOf, snapshot } from './events';
import { lockSlots, lockZones } from './locks';
import {
  CONTAINER_NO_RE, ISO_CODES, ZONE_ID_RE, isReefer, normalizeContainerNo, placementError, planCompaction, posLabel, zoneDimsError,
} from './domain/rules';
import { computeTempAlert, defaultReefer } from './domain/reefer';

type Tx = Prisma.TransactionClient;

export interface Ctx {
  actor: Actor;
  correlationId: string;
}

export type ContainerWithReefer = Container & { reefer: ReeferState | null };

export interface ArrivalInput {
  containerNo?: string;
  type: ContainerType;
  client?: string;
  weightKg?: number;
  zoneId: string;
  row?: number;
  col?: number;
  plannedExitDate?: string;
}

export interface ReeferPatch {
  commodity?: string;
  setPoint?: number;
  tempMin?: number;
  tempMax?: number;
  currentTemp?: number;
  powerStatus?: 'on' | 'off';
  ventSetting?: string;
  humidity?: string;
}

interface Pos {
  zoneId: string;
  row: number;
  col: number;
  tier: number;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CARRIERS = ['MSCU', 'CMAU', 'MAEU', 'HLCU', 'OOLU', 'EISU', 'TCLU', 'MSKU', 'ONEU', 'CSLU'];
const CONTAINER_CHANGED = 'Ce conteneur a été modifié par un autre utilisateur.';

export class YardService {
  constructor(private readonly prisma: PrismaClient, private readonly onCommitted: () => void = () => {}) {}

  // ---------- infrastructure ----------

  private async tx<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    try {
      const result = await this.prisma.$transaction(fn, { timeout: 10_000 });
      this.onCommitted();
      return result;
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw errors.ruleViolation('Emplacement ou numéro de conteneur pris entre-temps par une autre opération, réessayez.');
      }
      throw err;
    }
  }

  private async getZone(tx: Tx, id: string): Promise<Zone> {
    const zone = await tx.zone.findUnique({ where: { id } });
    if (!zone) throw errors.notFound(`Zone ${id} introuvable.`);
    return zone;
  }

  private async findPresent(tx: Tx, id: string): Promise<ContainerWithReefer> {
    const where = UUID_RE.test(id) ? { id, status: 'PRESENT' as const } : { containerNo: id, status: 'PRESENT' as const };
    const ct = await tx.container.findFirst({ where, include: { reefer: true } });
    if (!ct) throw errors.notFound(`Conteneur ${id} introuvable.`);
    return ct;
  }

  // Reads the container, locks its zone (shared) and slot plus any extra
  // zones/slots, then re-reads it: if it moved meanwhile, the caller's view is
  // stale.
  private async lockContainer(
    tx: Tx,
    id: string,
    extra: { zones?: { zoneId: string; mode: 'shared' | 'exclusive' }[]; slots?: { zoneId: string; row: number; col: number }[] } = {},
  ): Promise<ContainerWithReefer> {
    const before = await this.findPresent(tx, id);
    await lockZones(tx, [{ zoneId: before.zoneId, mode: 'shared' }, ...(extra.zones ?? [])]);
    await lockSlots(tx, [before, ...(extra.slots ?? [])]);
    const ct = await this.findPresent(tx, before.id);
    if (ct.zoneId !== before.zoneId || ct.row !== before.row || ct.col !== before.col) {
      throw errors.versionConflict(CONTAINER_CHANGED);
    }
    return ct;
  }

  private stackAt(tx: Tx, zoneId: string, row: number, col: number): Promise<Container[]> {
    return tx.container.findMany({ where: { zoneId, row, col, status: 'PRESENT' }, orderBy: { tier: 'asc' } });
  }

  private async assertTop(tx: Tx, ct: Container): Promise<void> {
    const stack = await this.stackAt(tx, ct.zoneId, ct.row, ct.col);
    if (stack[stack.length - 1]?.id !== ct.id) {
      throw errors.ruleViolation(`Seul le conteneur du sommet peut être déplacé (${ct.containerNo}).`);
    }
  }

  private checkVersion(current: number, expected: number | undefined, message: string): void {
    if (expected !== undefined && expected !== current) throw errors.versionConflict(message);
  }

  private async placementTier(tx: Tx, zone: Zone, row: number, col: number, type: string, ignoreId?: string): Promise<number> {
    if (!Number.isInteger(row) || !Number.isInteger(col) || row < 0 || col < 0 || row >= zone.rows || col >= zone.cols) {
      throw errors.validation(`Position ${posLabel(zone.id, row, col)} hors de la zone ${zone.id}.`);
    }
    const stack = (await this.stackAt(tx, zone.id, row, col)).filter((c) => c.id !== ignoreId);
    const reason = placementError(stack, type);
    if (reason) throw errors.ruleViolation(`${reason} (${posLabel(zone.id, row, col)}).`);
    return stack.length + 1;
  }

  private async firstFreeSlot(tx: Tx, zone: Zone, type: string): Promise<{ row: number; col: number } | null> {
    const present = await tx.container.findMany({ where: { zoneId: zone.id, status: 'PRESENT' }, select: { row: true, col: true, type: true } });
    for (let r = 0; r < zone.rows; r++) {
      for (let c = 0; c < zone.cols; c++) {
        const stack = present.filter((p) => p.row === r && p.col === c);
        if (!placementError(stack, type)) return { row: r, col: c };
      }
    }
    return null;
  }

  // Optimistic update: fails if someone else bumped the version in between.
  private async writePosition(tx: Tx, ct: ContainerWithReefer, pos: Pos): Promise<ContainerWithReefer> {
    const res = await tx.container.updateMany({
      where: { id: ct.id, version: ct.version },
      data: { zoneId: pos.zoneId, row: pos.row, col: pos.col, tier: pos.tier, version: { increment: 1 } },
    });
    if (res.count === 0) throw errors.versionConflict(CONTAINER_CHANGED);
    return { ...ct, ...pos, version: ct.version + 1 };
  }

  private recordMovement(
    tx: Tx,
    type: Movement['type'],
    containerId: string,
    from: Pos | null,
    to: Pos | null,
    ctx: Ctx,
  ): Promise<Movement> {
    return tx.movement.create({
      data: {
        type,
        containerId,
        fromZoneId: from?.zoneId,
        fromRow: from?.row,
        fromCol: from?.col,
        fromTier: from?.tier,
        toZoneId: to?.zoneId,
        toRow: to?.row,
        toCol: to?.col,
        toTier: to?.tier,
        userId: ctx.actor?.userId,
      },
    });
  }

  private async generateContainerNo(tx: Tx): Promise<string> {
    for (;;) {
      const no = CARRIERS[Math.floor(Math.random() * CARRIERS.length)] + String(Math.floor(Math.random() * 1e7)).padStart(7, '0');
      if (!(await tx.container.findFirst({ where: { containerNo: no, status: 'PRESENT' } }))) return no;
    }
  }

  // ---------- zones ----------

  listZones(): Promise<Zone[]> {
    return this.prisma.zone.findMany({ orderBy: { id: 'asc' } });
  }

  async createZone(input: { id: string; label?: string; rows: number; cols: number }, ctx: Ctx): Promise<Zone> {
    const id = input.id.trim().toUpperCase();
    if (!ZONE_ID_RE.test(id)) throw errors.validation('Identifiant de zone invalide (1 à 4 caractères alphanumériques).');
    const dims = zoneDimsError(input.rows, input.cols);
    if (dims) throw errors.validation(dims);
    return this.tx(async (tx) => {
      await lockZones(tx, [{ zoneId: id, mode: 'exclusive' }]);
      if (await tx.zone.findUnique({ where: { id } })) throw errors.ruleViolation(`La zone ${id} existe déjà.`);
      const zone = await tx.zone.create({ data: { id, label: input.label?.trim() || `Zone ${id}`, rows: input.rows, cols: input.cols } });
      await emit(tx, ctx, 'yard.zone.created', { zone: zoneData(zone) }, zone);
      return zone;
    });
  }

  updateZone(id: string, input: { label?: string; rows?: number; cols?: number; expectedVersion?: number }, ctx: Ctx): Promise<Zone> {
    return this.tx(async (tx) => {
      await lockZones(tx, [{ zoneId: id, mode: 'exclusive' }]);
      const zone = await this.getZone(tx, id);
      this.checkVersion(zone.version, input.expectedVersion, 'Cette zone a été modifiée par un autre utilisateur.');
      const rows = input.rows ?? zone.rows;
      const cols = input.cols ?? zone.cols;
      const dims = zoneDimsError(rows, cols);
      if (dims) throw errors.validation(dims);
      const outside = await tx.container.count({
        where: { zoneId: id, status: 'PRESENT', OR: [{ row: { gte: rows } }, { col: { gte: cols } }] },
      });
      if (outside > 0) {
        throw errors.ruleViolation(`Impossible de réduire la zone ${id} : ${outside} conteneur(s) hors des nouvelles dimensions.`);
      }
      const label = input.label?.trim() || zone.label;
      const updated = await tx.zone.update({ where: { id }, data: { label, rows, cols, version: { increment: 1 } } });
      await emit(tx, ctx, 'yard.zone.updated', { zone: zoneData(updated) }, updated);
      return updated;
    });
  }

  deleteZone(id: string, ctx: Ctx): Promise<void> {
    return this.tx(async (tx) => {
      await lockZones(tx, [{ zoneId: id, mode: 'exclusive' }]);
      const zone = await this.getZone(tx, id);
      const count = await tx.container.count({ where: { zoneId: id, status: 'PRESENT' } });
      if (count > 0) throw errors.ruleViolation(`Impossible de supprimer la zone ${id} : elle contient ${count} conteneur(s).`);
      await tx.zone.delete({ where: { id } });
      await emit(tx, ctx, 'yard.zone.deleted', { zoneId: id }, { id, version: zone.version + 1 });
    });
  }

  // ---------- containers ----------

  listContainers(filter: { zoneId?: string; type?: string; q?: string }): Promise<ContainerWithReefer[]> {
    return this.prisma.container.findMany({
      where: {
        status: 'PRESENT',
        ...(filter.zoneId ? { zoneId: filter.zoneId } : {}),
        ...(filter.type ? { type: filter.type as ContainerType } : {}),
        ...(filter.q ? { containerNo: { contains: normalizeContainerNo(filter.q) } } : {}),
      },
      include: { reefer: true },
      orderBy: [{ zoneId: 'asc' }, { row: 'asc' }, { col: 'asc' }, { tier: 'asc' }],
    });
  }

  getContainer(idOrNo: string): Promise<ContainerWithReefer> {
    return this.findPresent(this.prisma, idOrNo);
  }

  async arrival(input: ArrivalInput, ctx: Ctx): Promise<ContainerWithReefer> {
    const plannedExitDate = parseOptionalDate(input.plannedExitDate);
    return this.tx(async (tx) => {
      const autoSlot = input.row === undefined || input.col === undefined;
      await lockZones(tx, [{ zoneId: input.zoneId, mode: autoSlot ? 'exclusive' : 'shared' }]);
      const zone = await this.getZone(tx, input.zoneId);

      const containerNo = input.containerNo ? normalizeContainerNo(input.containerNo) : await this.generateContainerNo(tx);
      if (!CONTAINER_NO_RE.test(containerNo)) {
        throw errors.validation(`Numéro de conteneur invalide : ${containerNo} (format attendu : 4 lettres + 7 chiffres).`);
      }
      if (await tx.container.findFirst({ where: { containerNo, status: 'PRESENT' } })) {
        throw errors.ruleViolation(`Le conteneur ${containerNo} est déjà présent dans le yard.`);
      }

      let row = input.row;
      let col = input.col;
      if (autoSlot) {
        const slot = await this.firstFreeSlot(tx, zone, input.type);
        if (!slot) throw errors.ruleViolation(`Aucun emplacement disponible en zone ${zone.id}.`);
        ({ row, col } = slot);
      } else {
        await lockSlots(tx, [{ zoneId: zone.id, row: row!, col: col! }]);
      }
      const tier = await this.placementTier(tx, zone, row!, col!, input.type);

      const now = new Date();
      const reefer = isReefer(input.type) ? defaultReefer(now) : null;
      const ct = await tx.container.create({
        data: {
          containerNo,
          type: input.type,
          isoCode: ISO_CODES[input.type],
          client: input.client ?? null,
          weightKg: input.weightKg ?? null,
          zoneId: zone.id,
          row: row!,
          col: col!,
          tier,
          entryDate: now,
          plannedExitDate,
          ...(reefer ? { reefer: { create: reefer } } : {}),
        },
        include: { reefer: true },
      });
      await this.recordMovement(tx, 'ARRIVAL', ct.id, null, positionOf(ct), ctx);
      await emit(tx, ctx, 'yard.container.arrived', { container: snapshot(ct) }, ct);
      if (ct.reefer) await emitReeferConfigured(tx, ctx, ct);
      return ct;
    });
  }

  departure(id: string, input: { expectedVersion?: number }, ctx: Ctx): Promise<ContainerWithReefer> {
    return this.tx(async (tx) => {
      const ct = await this.lockContainer(tx, id);
      this.checkVersion(ct.version, input.expectedVersion, CONTAINER_CHANGED);
      await this.assertTop(tx, ct);
      const exitDate = new Date();
      const res = await tx.container.updateMany({
        where: { id: ct.id, version: ct.version },
        data: { status: 'DEPARTED', exitDate, version: { increment: 1 } },
      });
      if (res.count === 0) throw errors.versionConflict(CONTAINER_CHANGED);
      const gone: ContainerWithReefer = { ...ct, status: 'DEPARTED', exitDate, version: ct.version + 1 };
      await this.recordMovement(tx, 'DEPARTURE', ct.id, positionOf(ct), null, ctx);
      await emit(tx, ctx, 'yard.container.departed', { container: snapshot(gone), from: positionOf(ct) }, gone);
      return gone;
    });
  }

  transfer(id: string, input: { targetZoneId: string; expectedVersion?: number }, ctx: Ctx): Promise<ContainerWithReefer> {
    return this.tx(async (tx) => {
      const ct = await this.lockContainer(tx, id, { zones: [{ zoneId: input.targetZoneId, mode: 'exclusive' }] });
      this.checkVersion(ct.version, input.expectedVersion, CONTAINER_CHANGED);
      if (ct.zoneId === input.targetZoneId) throw errors.validation(`${ct.containerNo} est déjà en zone ${input.targetZoneId}.`);
      const zone = await this.getZone(tx, input.targetZoneId);
      await this.assertTop(tx, ct);
      const slot = await this.firstFreeSlot(tx, zone, ct.type);
      if (!slot) throw errors.ruleViolation(`Aucun emplacement disponible en zone ${zone.id}.`);
      const tier = await this.placementTier(tx, zone, slot.row, slot.col, ct.type, ct.id);
      const from = positionOf(ct);
      const to = { zoneId: zone.id, row: slot.row, col: slot.col, tier };
      const updated = await this.writePosition(tx, ct, to);
      await this.recordMovement(tx, 'TRANSFER', ct.id, from, to, ctx);
      await emit(tx, ctx, 'yard.container.transferred', { container: snapshot(updated), from, to }, updated);
      return updated;
    });
  }

  move(id: string, input: { toZoneId: string; toRow: number; toCol: number; expectedVersion?: number }, ctx: Ctx): Promise<ContainerWithReefer> {
    return this.tx(async (tx) => {
      const target = { zoneId: input.toZoneId, row: input.toRow, col: input.toCol };
      const ct = await this.lockContainer(tx, id, { zones: [{ zoneId: target.zoneId, mode: 'shared' }], slots: [target] });
      this.checkVersion(ct.version, input.expectedVersion, CONTAINER_CHANGED);
      if (ct.zoneId === target.zoneId && ct.row === target.row && ct.col === target.col) {
        throw errors.validation('Le conteneur est déjà à cet emplacement.');
      }
      await this.assertTop(tx, ct);
      const zone = await this.getZone(tx, target.zoneId);
      const tier = await this.placementTier(tx, zone, target.row, target.col, ct.type, ct.id);
      const from = positionOf(ct);
      const to = { ...target, tier };
      const updated = await this.writePosition(tx, ct, to);
      await this.recordMovement(tx, 'MOVE', ct.id, from, to, ctx);
      await emit(tx, ctx, 'yard.container.moved', { container: snapshot(updated), from, to }, updated);
      return updated;
    });
  }

  undoMovement(movementId: string, ctx: Ctx): Promise<ContainerWithReefer> {
    return this.tx(async (tx) => {
      const m = await tx.movement.findUnique({ where: { id: movementId } });
      if (!m) throw errors.notFound('Mouvement introuvable.');
      if (m.type !== 'MOVE') throw errors.validation('Seuls les déplacements (drag & drop) peuvent être annulés.');
      if (m.undoneAt) throw errors.ruleViolation('Ce mouvement a déjà été annulé.');
      const from = { zoneId: m.fromZoneId!, row: m.fromRow!, col: m.fromCol! };
      const ct = await this.lockContainer(tx, m.containerId, { zones: [{ zoneId: from.zoneId, mode: 'shared' }], slots: [from] }).catch(
        (err: unknown) => {
          if (err instanceof Error && 'code' in err && (err as { code: string }).code === 'NOT_FOUND') {
            throw errors.ruleViolation("Le conteneur n'est plus dans le yard : annulation impossible.");
          }
          throw err;
        },
      );
      const fresh = await tx.movement.findUniqueOrThrow({ where: { id: movementId } });
      if (fresh.undoneAt) throw errors.ruleViolation('Ce mouvement a déjà été annulé.');
      if (ct.zoneId !== m.toZoneId || ct.row !== m.toRow || ct.col !== m.toCol) {
        throw errors.ruleViolation(`${ct.containerNo} a été déplacé depuis : annulation impossible.`);
      }
      await this.assertTop(tx, ct);
      const zone = await this.getZone(tx, from.zoneId);
      const tier = await this.placementTier(tx, zone, from.row, from.col, ct.type, ct.id);
      const before = positionOf(ct);
      const to = { ...from, tier };
      const updated = await this.writePosition(tx, ct, to);
      await tx.movement.update({ where: { id: m.id }, data: { undoneAt: new Date(), undoneBy: ctx.actor?.userId } });
      await emit(tx, ctx, 'yard.container.relocated', { container: snapshot(updated), from: before, to, reason: 'UNDO' }, updated);
      return updated;
    });
  }

  compactZone(zoneId: string, ctx: Ctx): Promise<number> {
    return this.tx(async (tx) => {
      await lockZones(tx, [{ zoneId, mode: 'exclusive' }]);
      const zone = await this.getZone(tx, zoneId);
      const cts = await tx.container.findMany({ where: { zoneId, status: 'PRESENT' }, include: { reefer: true }, orderBy: { id: 'asc' } });
      if (cts.length === 0) return 0;
      const plan = planCompaction(zone, cts);
      if (!plan) throw errors.ruleViolation(`Compactage impossible : la zone ${zoneId} est trop pleine.`);

      // Park every container on a unique temporary row first, so the partial
      // unique slot index never sees two containers on the same final slot.
      for (const [i, ct] of cts.entries()) {
        await tx.container.update({ where: { id: ct.id }, data: { row: -(i + 1) } });
      }
      for (const ct of cts) {
        const target = plan.get(ct.id)!;
        const from = positionOf(ct);
        const to = { zoneId, ...target };
        const changed = from.row !== to.row || from.col !== to.col || from.tier !== to.tier;
        if (!changed) {
          await tx.container.update({ where: { id: ct.id }, data: { row: from.row } });
          continue;
        }
        const updated = await tx.container.update({
          where: { id: ct.id },
          data: { row: to.row, col: to.col, tier: to.tier, version: { increment: 1 } },
        });
        await this.recordMovement(tx, 'COMPACT', ct.id, from, to, ctx);
        await emit(tx, ctx, 'yard.container.relocated', { container: snapshot(updated), from, to, reason: 'COMPACT' }, updated);
      }
      return cts.length;
    });
  }

  async compactAll(ctx: Ctx): Promise<number> {
    let total = 0;
    for (const zone of await this.listZones()) total += await this.compactZone(zone.id, ctx);
    return total;
  }

  updateReefer(id: string, patch: ReeferPatch, ctx: Ctx): Promise<ContainerWithReefer> {
    return this.tx(async (tx) => {
      const ct = await this.findPresent(tx, id);
      if (!ct.reefer) throw errors.ruleViolation(`${ct.containerNo} n'est pas un reefer.`);
      const next = { ...ct.reefer, ...stripUndefined(patch) };
      if (patch.currentTemp !== undefined) next.lastReadingAt = new Date();
      next.alert = computeTempAlert(next);
      const reefer = await tx.reeferState.update({
        where: { containerId: ct.id },
        data: {
          commodity: next.commodity,
          setPoint: next.setPoint,
          tempMin: next.tempMin,
          tempMax: next.tempMax,
          currentTemp: next.currentTemp,
          powerStatus: next.powerStatus,
          ventSetting: next.ventSetting,
          humidity: next.humidity,
          lastReadingAt: next.lastReadingAt,
          alert: next.alert,
        },
      });
      const updated = { ...ct, reefer };
      await emitReeferConfigured(tx, ctx, updated);
      return updated;
    });
  }

  // ---------- movements ----------

  listMovements(take: number): Promise<(Movement & { container: Container })[]> {
    return this.prisma.movement.findMany({ orderBy: { createdAt: 'desc' }, take, include: { container: true } });
  }
}

function zoneData(z: Zone) {
  return { id: z.id, label: z.label, rows: z.rows, cols: z.cols, version: z.version };
}

function emitReeferConfigured(tx: Tx, ctx: Ctx, ct: ContainerWithReefer): Promise<void> {
  const r = ct.reefer!;
  return emit(
    tx,
    ctx,
    'yard.reefer.configured',
    {
      containerId: ct.id,
      containerNo: ct.containerNo,
      commodity: r.commodity,
      setPoint: r.setPoint,
      tempMin: r.tempMin,
      tempMax: r.tempMax,
      powerStatus: r.powerStatus === 'off' ? 'off' : 'on',
    },
    ct,
  );
}

function parseOptionalDate(value: string | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) throw errors.validation(`Date invalide : ${value}.`);
  return d;
}

function stripUndefined<T extends object>(o: T): Partial<T> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>;
}
```

- [ ] **Step 6: Vérifier le succès et le typage**

Run: `npm test -w @ccis/yard-service && npm run typecheck -w @ccis/yard-service`
Expected : tous les tests de `rules`, `yard-service` et `outbox-store` PASS ; aucune erreur TypeScript.

- [ ] **Step 7: Commit**

```bash
git add services/yard package-lock.json
git commit -m "feat(yard): transactional yard operations with advisory locks, optimistic versions and outbox events"
```

---

### Task 9: `yard-service` — API HTTP, démarrage et seed

**Files:**
- Create: `services/yard/src/mappers.ts`, `src/routes.ts`, `src/app.ts`, `src/config.ts`, `src/main.ts`, `scripts/seed.ts`, `test/routes.test.ts`

**Interfaces:**
- Consumes : `YardService`, `Ctx` (Task 8) ; `createApp`, `requireRole`, `actorOf` (service-kit) ; `AmqpClient`, `OutboxRelay`, `prismaOutboxStore`, `declareExchanges`, `PrismaLike` (messaging) ; `containerTypeSchema` (contracts).
- Produces :
  - `buildYardApp(deps: { service: YardService; checks?: Record<string, ReadinessCheck>; logger?: boolean }): FastifyInstance`
  - Routes (rôle minimal) : `GET /zones` (VIEWER), `POST /zones` 201 (ADMIN), `PATCH /zones/:id` (ADMIN), `DELETE /zones/:id` 204 (ADMIN), `POST /zones/compact-all` → `{ total }` (OPERATOR), `POST /zones/:id/compact` → `{ count }` (OPERATOR), `GET /containers?zoneId&type&q` (VIEWER), `GET /containers/:id` (VIEWER), `POST /containers/arrival` 201 (OPERATOR), `POST /containers/:id/departure` (OPERATOR, corps optionnel), `POST /containers/:id/transfer` (OPERATOR), `POST /containers/:id/move` (OPERATOR), `PATCH /containers/:id/reefer` (OPERATOR), `GET /movements?take` (VIEWER), `POST /movements/:id/undo` (OPERATOR)
  - Format JSON conteneur : `{ id, containerNo, type, isoCode, client, weightKg, zoneId, row, col, tier, entryDate, plannedExitDate, customsStatus, version, reefer: { commodity, setPoint, tempMin, tempMax, currentTemp, powerStatus, ventSetting, humidity, lastTempUpdate, tempAlert } | null }` (les noms `lastTempUpdate` et `tempAlert` sont ceux qu'attend le front)
  - Format zone : `{ id, label, rows, cols, version }` ; mouvement : `{ id, type, container: { id, containerNo, type }, fromZoneId, fromRow, fromCol, fromTier, toZoneId, toRow, toCol, toTier, userId, createdAt, undoneAt }`

- [ ] **Step 1: Écrire le test des routes (échoue)**

`services/yard/test/routes.test.ts` :
```ts
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { parseEnvelope } from '@ccis/contracts';
import { buildYardApp } from '../src/app';
import { YardService } from '../src/yard-service';
import { prisma, resetDb } from './helpers';

const app = buildYardApp({ service: new YardService(prisma), logger: false });
const as = (role: 'ADMIN' | 'OPERATOR' | 'VIEWER') => ({ 'x-user-id': `u-${role}`, 'x-user-role': role });

beforeEach(async () => {
  await resetDb();
  await app.inject({ method: 'POST', url: '/zones', headers: as('ADMIN'), payload: { id: 'A', label: 'Zone A', rows: 2, cols: 2 } });
});
afterAll(async () => { await app.close(); await prisma.$disconnect(); });

async function arrive(payload: Record<string, unknown> = {}) {
  return app.inject({ method: 'POST', url: '/containers/arrival', headers: as('OPERATOR'), payload: { type: 'FULL_20', zoneId: 'A', ...payload } });
}

describe('authorization', () => {
  it('401 without identity, 403 for a VIEWER writing, 403 for an OPERATOR managing zones', async () => {
    expect((await app.inject({ url: '/containers' })).statusCode).toBe(401);
    const viewer = await app.inject({ method: 'POST', url: '/containers/arrival', headers: as('VIEWER'), payload: { type: 'FULL_20', zoneId: 'A' } });
    expect(viewer.statusCode).toBe(403);
    const op = await app.inject({ method: 'POST', url: '/zones', headers: as('OPERATOR'), payload: { id: 'B', rows: 1, cols: 1 } });
    expect(op.statusCode).toBe(403);
  });
});

describe('containers', () => {
  it('arrival returns 201 with the frontend shape, GET lists it', async () => {
    const res = await arrive({ client: 'Star', weightKg: 12000, plannedExitDate: '2026-11-15' });
    expect(res.statusCode).toBe(201);
    const ct = res.json();
    expect(ct).toMatchObject({ zoneId: 'A', row: 0, col: 0, tier: 1, client: 'Star', weightKg: 12000, version: 1, reefer: null, customsStatus: 'RELEASED' });
    expect(ct.plannedExitDate).toBe('2026-11-15T00:00:00.000Z');
    const list = await app.inject({ url: '/containers', headers: as('VIEWER') });
    expect(list.json()).toHaveLength(1);
  });

  it('reefer fields use the names the frontend expects', async () => {
    const ct = (await arrive({ type: 'REEFER' })).json();
    expect(Object.keys(ct.reefer).sort()).toEqual(
      ['commodity', 'currentTemp', 'humidity', 'lastTempUpdate', 'powerStatus', 'setPoint', 'tempAlert', 'tempMax', 'tempMin', 'ventSetting'],
    );
  });

  it('invalid plannedExitDate → 400 VALIDATION, unknown type → 400', async () => {
    expect((await arrive({ plannedExitDate: 'demain' })).json()).toMatchObject({ code: 'VALIDATION' });
    expect((await arrive({ type: 'BOAT' })).statusCode).toBe(400);
  });

  it('departure without body is accepted', async () => {
    const ct = (await arrive()).json();
    const res = await app.inject({ method: 'POST', url: `/containers/${ct.id}/departure`, headers: as('OPERATOR') });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe('DEPARTED');
  });

  it('move with a stale expectedVersion → 409 VERSION_CONFLICT', async () => {
    const ct = (await arrive()).json();
    await app.inject({ method: 'POST', url: `/containers/${ct.id}/move`, headers: as('OPERATOR'), payload: { toZoneId: 'A', toRow: 1, toCol: 1 } });
    const res = await app.inject({
      method: 'POST', url: `/containers/${ct.id}/move`, headers: as('OPERATOR'),
      payload: { toZoneId: 'A', toRow: 0, toCol: 1, expectedVersion: 1 },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().code).toBe('VERSION_CONFLICT');
  });

  it('GET /containers/:id accepts the container number', async () => {
    const ct = (await arrive({ containerNo: 'MSCU1234567' })).json();
    const res = await app.inject({ url: '/containers/MSCU1234567', headers: as('VIEWER') });
    expect(res.json().id).toBe(ct.id);
  });

  it('propagates x-correlation-id into the outbox envelope', async () => {
    await app.inject({
      method: 'POST', url: '/containers/arrival', headers: { ...as('OPERATOR'), 'x-correlation-id': 'corr-from-gateway' },
      payload: { type: 'FULL_20', zoneId: 'A' },
    });
    const row = await prisma.outboxMessage.findFirstOrThrow({ where: { routingKey: 'yard.container.arrived' } });
    expect(parseEnvelope(row.payload)).toMatchObject({ correlationId: 'corr-from-gateway', actor: { userId: 'u-OPERATOR', role: 'OPERATOR' } });
  });
});

describe('zones, compaction and movements', () => {
  it('zone CRUD with versions', async () => {
    const z = await app.inject({ method: 'PATCH', url: '/zones/A', headers: as('ADMIN'), payload: { label: 'Import', expectedVersion: 1 } });
    expect(z.json()).toMatchObject({ id: 'A', label: 'Import', version: 2 });
    expect((await app.inject({ method: 'DELETE', url: '/zones/A', headers: as('ADMIN') })).statusCode).toBe(204);
    expect((await app.inject({ url: '/zones', headers: as('VIEWER') })).json()).toEqual([]);
  });

  it('compact routes return counts; compact-all is not taken as a zone id', async () => {
    await arrive({ row: 1, col: 1 });
    expect((await app.inject({ method: 'POST', url: '/zones/A/compact', headers: as('OPERATOR') })).json()).toEqual({ count: 1 });
    expect((await app.inject({ method: 'POST', url: '/zones/compact-all', headers: as('OPERATOR') })).json()).toEqual({ total: 1 });
  });

  it('movements list with embedded container, newest first, and undo', async () => {
    const ct = (await arrive()).json();
    await app.inject({ method: 'POST', url: `/containers/${ct.id}/move`, headers: as('OPERATOR'), payload: { toZoneId: 'A', toRow: 1, toCol: 1 } });
    const list = (await app.inject({ url: '/movements?take=10', headers: as('VIEWER') })).json();
    expect(list.map((m: { type: string }) => m.type)).toEqual(['MOVE', 'ARRIVAL']);
    expect(list[0].container).toEqual({ id: ct.id, containerNo: ct.containerNo, type: 'FULL_20' });
    const undo = await app.inject({ method: 'POST', url: `/movements/${list[0].id}/undo`, headers: as('OPERATOR') });
    expect(undo.json()).toMatchObject({ row: 0, col: 0 });
  });
});
```

- [ ] **Step 2: Vérifier l'échec**

Run: `npm test -w @ccis/yard-service -- routes`
Expected : FAIL, `Cannot find module '../src/app'`.

- [ ] **Step 3: Implémenter mappers, routes, app**

`services/yard/src/mappers.ts` :
```ts
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
```

`services/yard/src/routes.ts` :
```ts
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { containerTypeSchema } from '@ccis/contracts';
import { actorOf, requireRole } from '@ccis/service-kit';
import { toApiContainer, toApiMovement, toApiZone } from './mappers';
import type { Ctx, YardService } from './yard-service';

const version = z.number().int().positive().optional();
const zoneCreate = z.object({ id: z.string(), label: z.string().optional(), rows: z.number().int(), cols: z.number().int() });
const zoneUpdate = z.object({ label: z.string().optional(), rows: z.number().int().optional(), cols: z.number().int().optional(), expectedVersion: version });
const arrival = z.object({
  containerNo: z.string().optional(),
  type: containerTypeSchema,
  client: z.string().optional(),
  weightKg: z.number().int().nonnegative().optional(),
  zoneId: z.string(),
  row: z.number().int().optional(),
  col: z.number().int().optional(),
  plannedExitDate: z.string().optional(),
});
const versionOnly = z.object({ expectedVersion: version });
const transfer = z.object({ targetZoneId: z.string(), expectedVersion: version });
const move = z.object({ toZoneId: z.string(), toRow: z.number().int(), toCol: z.number().int(), expectedVersion: version });
const reefer = z.object({
  commodity: z.string().optional(),
  setPoint: z.number().optional(),
  tempMin: z.number().optional(),
  tempMax: z.number().optional(),
  currentTemp: z.number().optional(),
  powerStatus: z.enum(['on', 'off']).optional(),
  ventSetting: z.string().optional(),
  humidity: z.string().optional(),
});
const containerQuery = z.object({ zoneId: z.string().optional(), type: z.string().optional(), q: z.string().optional() });
const movementsQuery = z.object({ take: z.coerce.number().int().min(1).max(500).default(50) });
const idParam = z.object({ id: z.string() });

const viewer = { preHandler: requireRole('VIEWER') };
const operator = { preHandler: requireRole('OPERATOR') };
const admin = { preHandler: requireRole('ADMIN') };

function ctx(req: FastifyRequest): Ctx {
  return { actor: actorOf(req), correlationId: req.id };
}

export function registerRoutes(app: FastifyInstance, svc: YardService): void {
  // ----- zones -----
  app.get('/zones', viewer, async () => (await svc.listZones()).map(toApiZone));

  app.post('/zones', admin, async (req, reply) => {
    const zone = await svc.createZone(zoneCreate.parse(req.body), ctx(req));
    reply.code(201);
    return toApiZone(zone);
  });

  app.patch('/zones/:id', admin, async (req) => {
    const { id } = idParam.parse(req.params);
    return toApiZone(await svc.updateZone(id, zoneUpdate.parse(req.body ?? {}), ctx(req)));
  });

  app.delete('/zones/:id', admin, async (req, reply) => {
    await svc.deleteZone(idParam.parse(req.params).id, ctx(req));
    reply.code(204);
  });

  // Static path: Fastify's router prefers it over /zones/:id/compact.
  app.post('/zones/compact-all', operator, async (req) => ({ total: await svc.compactAll(ctx(req)) }));

  app.post('/zones/:id/compact', operator, async (req) => ({ count: await svc.compactZone(idParam.parse(req.params).id, ctx(req)) }));

  // ----- containers -----
  app.get('/containers', viewer, async (req) => (await svc.listContainers(containerQuery.parse(req.query))).map(toApiContainer));

  app.get('/containers/:id', viewer, async (req) => toApiContainer(await svc.getContainer(idParam.parse(req.params).id)));

  app.post('/containers/arrival', operator, async (req, reply) => {
    const ct = await svc.arrival(arrival.parse(req.body), ctx(req));
    reply.code(201);
    return toApiContainer(ct);
  });

  app.post('/containers/:id/departure', operator, async (req) =>
    toApiContainer(await svc.departure(idParam.parse(req.params).id, versionOnly.parse(req.body ?? {}), ctx(req))),
  );

  app.post('/containers/:id/transfer', operator, async (req) =>
    toApiContainer(await svc.transfer(idParam.parse(req.params).id, transfer.parse(req.body), ctx(req))),
  );

  app.post('/containers/:id/move', operator, async (req) =>
    toApiContainer(await svc.move(idParam.parse(req.params).id, move.parse(req.body), ctx(req))),
  );

  app.patch('/containers/:id/reefer', operator, async (req) =>
    toApiContainer(await svc.updateReefer(idParam.parse(req.params).id, reefer.parse(req.body ?? {}), ctx(req))),
  );

  // ----- movements -----
  app.get('/movements', viewer, async (req) => (await svc.listMovements(movementsQuery.parse(req.query).take)).map(toApiMovement));

  app.post('/movements/:id/undo', operator, async (req) => toApiContainer(await svc.undoMovement(idParam.parse(req.params).id, ctx(req))));
}
```

`services/yard/src/app.ts` :
```ts
import type { FastifyInstance } from 'fastify';
import { createApp, type ReadinessCheck } from '@ccis/service-kit';
import { registerRoutes } from './routes';
import type { YardService } from './yard-service';

export function buildYardApp(deps: { service: YardService; checks?: Record<string, ReadinessCheck>; logger?: boolean }): FastifyInstance {
  const app = createApp({ service: 'yard-service', checks: deps.checks, logger: deps.logger });
  registerRoutes(app, deps.service);
  return app;
}
```

- [ ] **Step 4: Vérifier le succès**

Run: `npm test -w @ccis/yard-service -- routes`
Expected : 11 tests PASS.

- [ ] **Step 5: Démarrage et seed**

`services/yard/src/config.ts` :
```ts
function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Variable d'environnement manquante : ${name}`);
  return v;
}

export const config = {
  port: Number(process.env.PORT ?? 4002),
  host: process.env.HOST ?? '0.0.0.0',
  amqpUrl: required('AMQP_URL'),
};
```

`services/yard/src/main.ts` :
```ts
import { AmqpClient, OutboxRelay, declareExchanges, prismaOutboxStore, type PrismaLike } from '@ccis/messaging';
import { PrismaClient } from './generated/prisma';
import { buildYardApp } from './app';
import { config } from './config';
import { YardService } from './yard-service';

const prisma = new PrismaClient();
let relay: OutboxRelay | undefined;
const service = new YardService(prisma, () => relay?.kick());
let amqp: AmqpClient | undefined;

const app = buildYardApp({
  service,
  checks: {
    database: async () => { await prisma.$queryRaw`SELECT 1`; },
    broker: async () => { if (!amqp?.connected) throw new Error('RabbitMQ non connecté'); },
  },
});

amqp = new AmqpClient(config.amqpUrl, app.log);
amqp.onConnected((ch) => declareExchanges(ch, ['yard.events', 'yard.commands']));
relay = new OutboxRelay({ store: prismaOutboxStore(prisma as unknown as PrismaLike), client: amqp, log: app.log });

const shutdown = async () => {
  await app.close();
  await relay?.stop();
  await amqp?.stop();
  await prisma.$disconnect();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

await amqp.start();
relay.start();
await app.listen({ port: config.port, host: config.host });
```

`services/yard/scripts/seed.ts` :
```ts
import { PrismaClient, type ContainerType } from '../src/generated/prisma';
import { ISO_CODES, MAX_TIER, isReefer, sizeOf } from '../src/domain/rules';
import { defaultReefer } from '../src/domain/reefer';

// Demo data, ~50 % full. Writes no events: this is the initial state.
// Usage: npm run seed -w @ccis/yard-service [-- --reset]
const ZONES = [
  { id: 'A', label: 'Zone A — Import', rows: 6, cols: 10 },
  { id: 'B', label: 'Zone B — Export', rows: 5, cols: 10 },
  { id: 'C', label: 'Zone C — Transit', rows: 4, cols: 10 },
  { id: 'R', label: 'Zone R — Reefer', rows: 3, cols: 8 },
];
const CLIENTS = ['Jovenna', 'Star', 'Brasseries', 'Socota', 'Galana', 'Henri Fraise', 'Total Energies', 'Ambatovy', 'QMM', 'Colas'];
const CARRIERS = ['MSCU', 'CMAU', 'MAEU', 'HLCU', 'OOLU', 'EISU', 'TCLU', 'MSKU', 'ONEU', 'CSLU'];
const DRY: ContainerType[] = ['EMPTY_20', 'EMPTY_40', 'FULL_20', 'FULL_40'];
const REEF: ContainerType[] = ['REEFER', 'REEFER_FULL'];
const DAY = 86_400_000;
const pick = <T>(a: readonly T[]): T => a[Math.floor(Math.random() * a.length)];

const prisma = new PrismaClient();
const reset = process.argv.includes('--reset');

if (!reset && (await prisma.zone.count()) > 0) {
  console.log('Données déjà présentes (utiliser -- --reset pour réinitialiser).');
} else {
  await prisma.$executeRawUnsafe('TRUNCATE "Movement", "ReeferState", "Container", "Zone", outbox CASCADE');
  const used = new Set<string>();
  const containerNo = () => {
    for (;;) {
      const no = pick(CARRIERS) + String(Math.floor(Math.random() * 1e7)).padStart(7, '0');
      if (!used.has(no)) { used.add(no); return no; }
    }
  };
  const now = Date.now();
  let count = 0;
  for (const zone of ZONES) {
    await prisma.zone.create({ data: zone });
    for (let r = 0; r < zone.rows; r++) {
      for (let c = 0; c < zone.cols; c++) {
        if (Math.random() < 0.3) continue;
        const types = zone.id === 'R' ? REEF : DRY;
        const size = Math.random() < 0.5 ? 20 : 40;
        const pool = types.filter((t) => sizeOf(t) === size).length ? types.filter((t) => sizeOf(t) === size) : types;
        const height = 1 + Math.floor(Math.random() * MAX_TIER);
        for (let tier = 1; tier <= height; tier++) {
          const type = pick(pool);
          const heavy = type.startsWith('FULL') || type === 'REEFER_FULL';
          await prisma.container.create({
            data: {
              containerNo: containerNo(),
              type,
              isoCode: ISO_CODES[type],
              client: pick(CLIENTS),
              weightKg: heavy ? 8000 + Math.floor(Math.random() * 20000) : 2200 + Math.floor(Math.random() * 1800),
              zoneId: zone.id,
              row: r,
              col: c,
              tier,
              entryDate: new Date(now - (1 + Math.random() * 30) * DAY),
              plannedExitDate: new Date(now + (1 + Math.random() * 20) * DAY),
              ...(isReefer(type) ? { reefer: { create: defaultReefer(new Date(now)) } } : {}),
            },
          });
          count++;
        }
      }
    }
  }
  console.log(`Seed : ${count} conteneurs, ${ZONES.length} zones.`);
}
await prisma.$disconnect();
```

- [ ] **Step 6: Suite complète et typage**

Run: `npm test -w @ccis/yard-service && npm run typecheck -w @ccis/yard-service`
Expected : tous les tests PASS, aucune erreur TypeScript.

- [ ] **Step 7: Commit**

```bash
git add services/yard
git commit -m "feat(yard): HTTP API, startup with outbox relay, demo seed"
```

---

### Task 10: `gateway` — authentification, routage, erreurs amont

**Files:**
- Create: `services/gateway/package.json`, `tsconfig.json`, `vitest.config.ts`, `src/config.ts`, `src/verify.ts`, `src/tickets.ts`, `src/hub.ts`, `src/forward.ts`, `src/app.ts`, `test/keys.ts`, `test/tickets.test.ts`, `test/gateway.test.ts`

**Interfaces:**
- Consumes : `createApp`, `errors`, `Identity` (service-kit) ; `roleSchema` (contracts).
- Produces :
  - `type VerifiedIdentity = Identity & { exp: number }` ; `createTokenVerifier(publicKeyPem: string): Promise<(token: string) => Promise<VerifiedIdentity>>`
  - `class TicketStore { constructor(ttlMs?: number, now?: () => number); issue(identity: VerifiedIdentity): string; consume(ticket: string): VerifiedIdentity | null }`
  - `class Hub { add(socket: WebSocket, expSeconds: number): void; broadcast(frame: { event: string; data: unknown; at: string }): void; readonly size: number; closeAll(): void }`
  - `forwardTo(target: { name: string; url: string }, timeoutMs?: number): RouteHandler`
  - `buildGatewayApp(deps: GatewayDeps): Promise<FastifyInstance>` avec `GatewayDeps = { verify; services: { auth: Target; yard: Target }; tickets: TicketStore; hub: Hub; corsOrigin: string[]; checks?: Record<string, ReadinessCheck>; logger?: boolean }`
  - HTTP : `POST /auth/login` (public), `GET /auth/me`, `POST /ws-ticket` → `{ ticket }`, `GET /ws?ticket=` (public, WebSocket), `* /zones…`, `* /containers…`, `* /movements…`

- [ ] **Step 1: Squelette**

`services/gateway/package.json` :
```json
{
  "name": "@ccis/gateway",
  "private": true,
  "type": "module",
  "scripts": {
    "start": "tsx src/main.ts",
    "dev": "tsx watch src/main.ts",
    "test": "vitest run",
    "typecheck": "tsc -p tsconfig.json"
  },
  "dependencies": {
    "@ccis/contracts": "*",
    "@ccis/messaging": "*",
    "@ccis/service-kit": "*",
    "@fastify/cors": "11.1.0",
    "@fastify/websocket": "11.3.4",
    "fastify": "5.12.7",
    "jose": "6.2.13"
  },
  "devDependencies": {
    "@types/ws": "8.18.1",
    "@testcontainers/rabbitmq": "11.14.0"
  }
}
```
`services/gateway/tsconfig.json` : `{ "extends": "../../tsconfig.base.json", "include": ["src", "test", "vitest.config.ts"] }`
`services/gateway/vitest.config.ts` :
```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({ test: { fileParallelism: false, testTimeout: 30_000, hookTimeout: 180_000 } });
```
Run: `npm view @fastify/cors@11 version | tail -1` et `npm view @types/ws version` ; si les versions diffèrent de celles ci-dessus, mettre à jour `package.json` avec les valeurs affichées. Puis `npm install`.

`services/gateway/test/keys.ts` :
```ts
import { exportSPKI, generateKeyPair, SignJWT } from 'jose';

export async function testKeys() {
  const { privateKey, publicKey } = await generateKeyPair('RS256', { extractable: true });
  const publicPem = await exportSPKI(publicKey);
  const sign = (sub: string, role: string, expiresIn = '1h', issuer = 'ccis-auth') =>
    new SignJWT({ role }).setProtectedHeader({ alg: 'RS256' }).setSubject(sub).setIssuer(issuer).setIssuedAt().setExpirationTime(expiresIn).sign(privateKey);
  return { publicPem, sign };
}
```

- [ ] **Step 2: Tests (échouent)**

`services/gateway/test/tickets.test.ts` :
```ts
import { describe, expect, it } from 'vitest';
import { TicketStore } from '../src/tickets';

const id = { userId: 'u1', role: 'OPERATOR' as const, exp: 9_999_999_999 };

describe('TicketStore', () => {
  it('a ticket can be consumed once', () => {
    const s = new TicketStore();
    const t = s.issue(id);
    expect(t.length).toBeGreaterThanOrEqual(40);
    expect(s.consume(t)).toEqual(id);
    expect(s.consume(t)).toBeNull();
  });

  it('expires after the ttl', () => {
    let now = 0;
    const s = new TicketStore(30_000, () => now);
    const t = s.issue(id);
    now = 30_001;
    expect(s.consume(t)).toBeNull();
  });

  it('unknown tickets are rejected', () => {
    expect(new TicketStore().consume('nope')).toBeNull();
  });
});
```

`services/gateway/test/gateway.test.ts` :
```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { buildGatewayApp } from '../src/app';
import { Hub } from '../src/hub';
import { TicketStore } from '../src/tickets';
import { createTokenVerifier } from '../src/verify';
import { testKeys } from './keys';

let upstream: FastifyInstance;
let upstreamUrl: string;
let gw: FastifyInstance;
let gwUrl: string;
let keys: Awaited<ReturnType<typeof testKeys>>;
const hub = new Hub();
const seen: { headers: Record<string, unknown>; body: unknown; url: string; method: string }[] = [];

beforeAll(async () => {
  keys = await testKeys();
  upstream = Fastify();
  upstream.all('/*', async (req, reply) => {
    seen.push({ headers: req.headers, body: req.body, url: req.url, method: req.method });
    if (req.url.startsWith('/zones/missing')) return reply.code(404).send({ error: 'Zone missing introuvable.', code: 'NOT_FOUND' });
    if (req.method === 'DELETE') return reply.code(204).send();
    return { ok: true, url: req.url };
  });
  await upstream.listen({ port: 0, host: '127.0.0.1' });
  upstreamUrl = `http://127.0.0.1:${(upstream.server.address() as { port: number }).port}`;

  gw = await buildGatewayApp({
    verify: await createTokenVerifier(keys.publicPem),
    services: { auth: { name: 'auth', url: upstreamUrl }, yard: { name: 'yard', url: upstreamUrl } },
    tickets: new TicketStore(),
    hub,
    corsOrigin: ['http://127.0.0.1:5180'],
    logger: false,
  });
  await gw.listen({ port: 0, host: '127.0.0.1' });
  gwUrl = `http://127.0.0.1:${(gw.server.address() as { port: number }).port}`;
});
afterAll(async () => { await gw.close(); await upstream.close(); });

const bearer = async (role = 'OPERATOR') => ({ authorization: `Bearer ${await keys.sign('user-1', role)}` });

describe('authentication', () => {
  it('401 without token, with a bad token, with a wrong issuer, with an expired token', async () => {
    expect((await gw.inject({ url: '/containers' })).json()).toMatchObject({ code: 'UNAUTHORIZED' });
    expect((await gw.inject({ url: '/containers', headers: { authorization: 'Bearer nope' } })).statusCode).toBe(401);
    const wrongIss = await keys.sign('u', 'ADMIN', '1h', 'someone-else');
    expect((await gw.inject({ url: '/containers', headers: { authorization: `Bearer ${wrongIss}` } })).statusCode).toBe(401);
    const expired = await keys.sign('u', 'ADMIN', '-1s');
    expect((await gw.inject({ url: '/containers', headers: { authorization: `Bearer ${expired}` } })).statusCode).toBe(401);
  });

  it('/auth/login is public and forwards x-forwarded-for', async () => {
    seen.length = 0;
    const res = await gw.inject({ method: 'POST', url: '/auth/login', payload: { email: 'a@b.c', password: 'x' }, remoteAddress: '10.1.2.3' });
    expect(res.statusCode).toBe(200);
    expect(seen[0].headers['x-forwarded-for']).toBe('10.1.2.3');
    expect(seen[0].body).toEqual({ email: 'a@b.c', password: 'x' });
  });
});

describe('forwarding', () => {
  it('injects identity, drops spoofed identity headers, propagates the correlation id', async () => {
    seen.length = 0;
    const res = await gw.inject({
      method: 'POST', url: '/containers/abc/move?x=1',
      headers: { ...(await bearer()), 'x-user-role': 'ADMIN', 'x-correlation-id': 'corr-9' },
      payload: { toZoneId: 'A', toRow: 0, toCol: 0 },
    });
    expect(res.statusCode).toBe(200);
    expect(seen[0]).toMatchObject({ url: '/containers/abc/move?x=1', method: 'POST', body: { toZoneId: 'A', toRow: 0, toCol: 0 } });
    expect(seen[0].headers['x-user-id']).toBe('user-1');
    expect(seen[0].headers['x-user-role']).toBe('OPERATOR');
    expect(seen[0].headers['x-correlation-id']).toBe('corr-9');
    expect(seen[0].headers.authorization).toBeUndefined();
  });

  it('relays upstream status and body, including 404 and 204', async () => {
    const notFound = await gw.inject({ url: '/zones/missing', headers: await bearer() });
    expect(notFound.statusCode).toBe(404);
    expect(notFound.json()).toMatchObject({ code: 'NOT_FOUND' });
    const del = await gw.inject({ method: 'DELETE', url: '/zones/A', headers: await bearer('ADMIN') });
    expect(del.statusCode).toBe(204);
    expect(del.body).toBe('');
  });

  it('503 SERVICE_UNAVAILABLE when the upstream is down', async () => {
    const down = await buildGatewayApp({
      verify: await createTokenVerifier(keys.publicPem),
      services: { auth: { name: 'auth', url: 'http://127.0.0.1:1' }, yard: { name: 'yard', url: 'http://127.0.0.1:1' } },
      tickets: new TicketStore(), hub: new Hub(), corsOrigin: [], logger: false,
    });
    const res = await down.inject({ url: '/zones', headers: await bearer() });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toMatchObject({ code: 'SERVICE_UNAVAILABLE' });
    expect(res.json().error).toContain('yard');
  });
});

describe('websocket', () => {
  function connect(ticket: string): Promise<{ ws: WebSocket; frames: unknown[]; closed: Promise<number> }> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(`${gwUrl.replace('http', 'ws')}/ws?ticket=${ticket}`);
      const frames: unknown[] = [];
      const closed = new Promise<number>((r) => ws.addEventListener('close', (e) => r(e.code)));
      ws.addEventListener('message', (e) => frames.push(JSON.parse(String(e.data))));
      ws.addEventListener('open', () => resolve({ ws, frames, closed }));
      ws.addEventListener('error', () => resolve({ ws, frames, closed }));
      setTimeout(() => reject(new Error('ws timeout')), 5000);
    });
  }

  it('a ticket opens a socket that receives broadcasts; the same ticket is refused with 4401', async () => {
    const { ticket } = (await gw.inject({ method: 'POST', url: '/ws-ticket', headers: await bearer() })).json();
    const first = await connect(ticket);
    await new Promise((r) => setTimeout(r, 50));
    hub.broadcast({ event: 'yard.container.moved', data: { id: 'x' }, at: '2026-10-25T00:00:00.000Z' });
    await new Promise((r) => setTimeout(r, 100));
    expect(first.frames).toEqual([{ event: 'yard.container.moved', data: { id: 'x' }, at: '2026-10-25T00:00:00.000Z' }]);

    const second = await connect(ticket);
    expect(await second.closed).toBe(4401);
    first.ws.close();
  });

  it('/ws-ticket requires authentication', async () => {
    expect((await gw.inject({ method: 'POST', url: '/ws-ticket' })).statusCode).toBe(401);
  });
});
```

- [ ] **Step 3: Vérifier l'échec**

Run: `npm test -w @ccis/gateway`
Expected : FAIL, modules `../src/…` introuvables.

- [ ] **Step 4: Implémenter**

`services/gateway/src/verify.ts` :
```ts
import { importSPKI, jwtVerify } from 'jose';
import { roleSchema } from '@ccis/contracts';
import type { Identity } from '@ccis/service-kit';

export type VerifiedIdentity = Identity & { exp: number };
export type TokenVerifier = (token: string) => Promise<VerifiedIdentity>;

export async function createTokenVerifier(publicKeyPem: string): Promise<TokenVerifier> {
  const key = await importSPKI(publicKeyPem, 'RS256');
  return async (token) => {
    const { payload } = await jwtVerify(token, key, { issuer: 'ccis-auth', algorithms: ['RS256'] });
    if (!payload.sub || !payload.exp) throw new Error('jeton incomplet');
    return { userId: payload.sub, role: roleSchema.parse(payload.role), exp: payload.exp };
  };
}
```

`services/gateway/src/tickets.ts` :
```ts
import { randomBytes } from 'node:crypto';
import type { VerifiedIdentity } from './verify';

// One-time WebSocket tickets: browsers cannot set headers on the upgrade
// request, and a ticket keeps the JWT out of URLs and logs.
export class TicketStore {
  private readonly tickets = new Map<string, { identity: VerifiedIdentity; expiresAt: number }>();

  constructor(private readonly ttlMs = 30_000, private readonly now: () => number = Date.now) {}

  issue(identity: VerifiedIdentity): string {
    this.sweep();
    const ticket = randomBytes(32).toString('base64url');
    this.tickets.set(ticket, { identity, expiresAt: this.now() + this.ttlMs });
    return ticket;
  }

  consume(ticket: string): VerifiedIdentity | null {
    const entry = this.tickets.get(ticket);
    this.tickets.delete(ticket);
    if (!entry || entry.expiresAt < this.now()) return null;
    return entry.identity;
  }

  private sweep(): void {
    const t = this.now();
    for (const [k, v] of this.tickets) if (v.expiresAt < t) this.tickets.delete(k);
  }
}
```

`services/gateway/src/hub.ts` :
```ts
import type { WebSocket } from 'ws';

const MAX_TIMEOUT = 2_147_000_000;

// Connected browsers. Each socket is closed with 4401 when its JWT expires, so
// the frontend sends the user back to the login screen instead of silently
// losing realtime updates.
export class Hub {
  private readonly sockets = new Map<WebSocket, NodeJS.Timeout>();

  add(socket: WebSocket, expSeconds: number): void {
    const ms = Math.min(Math.max(expSeconds * 1000 - Date.now(), 0), MAX_TIMEOUT);
    const timer = setTimeout(() => socket.close(4401, 'session expired'), ms);
    this.sockets.set(socket, timer);
    socket.on('close', () => {
      clearTimeout(timer);
      this.sockets.delete(socket);
    });
  }

  broadcast(frame: { event: string; data: unknown; at: string }): void {
    const data = JSON.stringify(frame);
    for (const socket of this.sockets.keys()) {
      if (socket.readyState === 1) socket.send(data);
    }
  }

  get size(): number {
    return this.sockets.size;
  }

  closeAll(): void {
    for (const socket of this.sockets.keys()) socket.close(1001, 'shutdown');
  }
}
```

`services/gateway/src/forward.ts` :
```ts
import type { FastifyReply, FastifyRequest } from 'fastify';
import { errors } from '@ccis/service-kit';

export interface Target {
  name: string;
  url: string;
}

// Rebuilds outgoing headers from scratch: client-supplied x-user-* headers and
// the Authorization header never reach the services.
export function forwardTo(target: Target, timeoutMs = 5000) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    const headers: Record<string, string> = {
      accept: 'application/json',
      'x-correlation-id': req.id,
      'x-forwarded-for': req.ip,
    };
    if (req.identity) {
      headers['x-user-id'] = req.identity.userId;
      headers['x-user-role'] = req.identity.role;
    }
    const hasBody = req.body !== undefined && req.body !== null && req.method !== 'GET' && req.method !== 'HEAD';
    if (hasBody) headers['content-type'] = 'application/json';

    let res: Response;
    try {
      res = await fetch(target.url + req.url, {
        method: req.method,
        headers,
        body: hasBody ? JSON.stringify(req.body) : undefined,
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      req.log.warn({ err, service: target.name }, 'upstream unreachable');
      throw errors.serviceUnavailable(`Service ${target.name} indisponible, réessayez dans un instant.`);
    }

    reply.code(res.status);
    const contentType = res.headers.get('content-type');
    if (contentType) reply.header('content-type', contentType);
    const text = await res.text();
    return reply.send(text.length > 0 ? text : undefined);
  };
}
```

`services/gateway/src/app.ts` :
```ts
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import type { FastifyInstance } from 'fastify';
import { createApp, errors, type ReadinessCheck } from '@ccis/service-kit';
import { forwardTo, type Target } from './forward';
import type { Hub } from './hub';
import type { TicketStore } from './tickets';
import type { TokenVerifier, VerifiedIdentity } from './verify';

export interface GatewayDeps {
  verify: TokenVerifier;
  services: { auth: Target; yard: Target };
  tickets: TicketStore;
  hub: Hub;
  corsOrigin: string[];
  checks?: Record<string, ReadinessCheck>;
  logger?: boolean;
}

declare module 'fastify' {
  interface FastifyRequest {
    tokenExp?: number;
  }
}

const PUBLIC_ROUTES = new Set(['/auth/login', '/ws', '/health/live', '/health/ready']);
const METHODS = ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'] as const;

export async function buildGatewayApp(deps: GatewayDeps): Promise<FastifyInstance> {
  const app = createApp({ service: 'gateway', checks: deps.checks, logger: deps.logger });
  await app.register(cors, {
    origin: deps.corsOrigin,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    exposedHeaders: ['x-correlation-id'],
  });
  await app.register(websocket);

  app.addHook('onRequest', async (req) => {
    if (req.method === 'OPTIONS') return;
    const route = req.routeOptions.url;
    if (route && PUBLIC_ROUTES.has(route)) return;
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) throw errors.unauthorized('Authentification requise.');
    let identity: VerifiedIdentity;
    try {
      identity = await deps.verify(header.slice('Bearer '.length));
    } catch {
      throw errors.unauthorized('Session expirée ou jeton invalide, reconnectez-vous.');
    }
    req.identity = { userId: identity.userId, role: identity.role };
    req.tokenExp = identity.exp;
  });

  // ----- auth -----
  app.post('/auth/login', forwardTo(deps.services.auth));
  app.get('/auth/me', forwardTo(deps.services.auth));

  // ----- realtime -----
  app.post('/ws-ticket', async (req) => ({
    ticket: deps.tickets.issue({ userId: req.identity!.userId, role: req.identity!.role, exp: req.tokenExp! }),
  }));

  app.get('/ws', { websocket: true }, (socket, req) => {
    const ticket = (req.query as { ticket?: string }).ticket;
    const identity = ticket ? deps.tickets.consume(ticket) : null;
    if (!identity) {
      socket.close(4401, 'unauthorized');
      return;
    }
    deps.hub.add(socket, identity.exp);
  });

  // ----- yard -----
  const yard = forwardTo(deps.services.yard);
  for (const prefix of ['/zones', '/containers', '/movements']) {
    app.route({ method: [...METHODS], url: prefix, handler: yard });
    app.route({ method: [...METHODS], url: `${prefix}/*`, handler: yard });
  }

  return app;
}
```

- [ ] **Step 5: Vérifier le succès et le typage**

Run: `npm test -w @ccis/gateway && npm run typecheck -w @ccis/gateway`
Expected : tests `tickets` et `gateway` PASS ; aucune erreur TypeScript.

- [ ] **Step 6: Commit**

```bash
git add services/gateway package-lock.json
git commit -m "feat(gateway): JWT verification, REST forwarding, websocket tickets and hub"
```

---

### Task 11: `gateway` — relais des événements RabbitMQ vers les navigateurs

**Files:**
- Create: `services/gateway/src/main.ts`, `src/config.ts`, `src/fanout.ts`, `test/fanout.test.ts`

**Interfaces:**
- Consumes : `AmqpClient`, `subscribeEphemeral` (messaging) ; `Hub` (Task 10) ; `Envelope` (contracts).
- Produces : `startFanout(client: AmqpClient, hub: Hub, log: Logger): void` (abonnement à `yard.events` `#`, trame `{ event: env.type, data: env.data, at: env.occurredAt }`) ; processus gateway complet.

- [ ] **Step 1: Test (échoue)**

`services/gateway/test/fanout.test.ts` :
```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { RabbitMQContainer, type StartedRabbitMQContainer } from '@testcontainers/rabbitmq';
import { createEnvelope } from '@ccis/contracts';
import { AmqpClient, declareExchanges, publishAll } from '@ccis/messaging';
import { startFanout } from '../src/fanout';
import type { Hub } from '../src/hub';

const silent = { info: () => {}, warn: () => {}, error: () => {} };
let rabbit: StartedRabbitMQContainer;

beforeAll(async () => { rabbit = await new RabbitMQContainer('rabbitmq:3.13-management-alpine').start(); });
afterAll(async () => { await rabbit?.stop(); });

describe('startFanout', () => {
  it('broadcasts every yard event to the hub as a frontend frame', async () => {
    const frames: unknown[] = [];
    const hub = { broadcast: (f: unknown) => frames.push(f) } as unknown as Hub;

    const publisher = new AmqpClient(rabbit.getAmqpUrl(), silent);
    publisher.onConnected((ch) => declareExchanges(ch, ['yard.events']));
    await publisher.start();
    const consumer = new AmqpClient(rabbit.getAmqpUrl(), silent);
    startFanout(consumer, hub, silent);
    await consumer.start();

    const env = createEnvelope('yard.zone.deleted', { zoneId: 'A' }, {
      source: 'test', correlationId: 'c', aggregateId: 'A', aggregateVersion: 2, actor: null,
    });
    await publishAll(publisher.channel!, [{ id: env.id, exchange: 'yard.events', routingKey: env.type, payload: env }]);

    const start = Date.now();
    while (frames.length === 0 && Date.now() - start < 5000) await new Promise((r) => setTimeout(r, 20));
    expect(frames).toEqual([{ event: 'yard.zone.deleted', data: { zoneId: 'A' }, at: env.occurredAt }]);
    await publisher.stop();
    await consumer.stop();
  });
});
```

- [ ] **Step 2: Vérifier l'échec**

Run: `npm test -w @ccis/gateway -- fanout`
Expected : FAIL, `Cannot find module '../src/fanout'`.

- [ ] **Step 3: Implémenter**

`services/gateway/src/fanout.ts` :
```ts
import { subscribeEphemeral, type AmqpClient, type Logger } from '@ccis/messaging';
import type { Hub } from './hub';

export function startFanout(client: AmqpClient, hub: Hub, log: Logger): void {
  subscribeEphemeral(client, {
    queuePrefix: 'gateway',
    bindings: [{ exchange: 'yard.events', pattern: '#' }],
    onMessage: (env) => hub.broadcast({ event: env.type, data: env.data, at: env.occurredAt }),
    log,
  });
}
```

`services/gateway/src/config.ts` :
```ts
import { readFileSync } from 'node:fs';

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Variable d'environnement manquante : ${name}`);
  return v;
}

export const config = {
  port: Number(process.env.PORT ?? 4000),
  host: process.env.HOST ?? '0.0.0.0',
  authUrl: required('AUTH_URL'),
  yardUrl: required('YARD_URL'),
  amqpUrl: required('AMQP_URL'),
  corsOrigin: (process.env.CORS_ORIGIN ?? 'http://127.0.0.1:5180').split(',').map((s) => s.trim()).filter(Boolean),
  publicKeyPem: () => readFileSync(required('JWT_PUBLIC_KEY_FILE'), 'utf8'),
};
```

`services/gateway/src/main.ts` :
```ts
import { AmqpClient } from '@ccis/messaging';
import { buildGatewayApp } from './app';
import { config } from './config';
import { startFanout } from './fanout';
import { Hub } from './hub';
import { TicketStore } from './tickets';
import { createTokenVerifier } from './verify';

const hub = new Hub();
let amqp: AmqpClient | undefined;

const app = await buildGatewayApp({
  verify: await createTokenVerifier(config.publicKeyPem()),
  services: { auth: { name: 'auth', url: config.authUrl }, yard: { name: 'yard', url: config.yardUrl } },
  tickets: new TicketStore(),
  hub,
  corsOrigin: config.corsOrigin,
  checks: { broker: async () => { if (!amqp?.connected) throw new Error('RabbitMQ non connecté'); } },
});

amqp = new AmqpClient(config.amqpUrl, app.log);
startFanout(amqp, hub, app.log);

const shutdown = async () => {
  hub.closeAll();
  await app.close();
  await amqp?.stop();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

await amqp.start();
await app.listen({ port: config.port, host: config.host });
```

- [ ] **Step 4: Vérifier le succès et le typage**

Run: `npm test -w @ccis/gateway && npm run typecheck -w @ccis/gateway`
Expected : tous les tests PASS, aucune erreur TypeScript.

- [ ] **Step 5: Commit**

```bash
git add services/gateway
git commit -m "feat(gateway): relay RabbitMQ yard events to websocket clients"
```

---

### Task 12: Services dans Docker Compose et tests de fumée

**Files:**
- Modify: `infra/docker-compose.yml` (ajout de `auth`, `yard`, `gateway`)
- Create: `infra/scripts/smoke.mjs`, `infra/scripts/smoke-broker-down.sh`

**Interfaces:**
- Consumes : tout ce qui précède.
- Produces : `npm run infra:up` lance l'ensemble ; gateway sur `127.0.0.1:4000`.

- [ ] **Step 1: Ajouter les services au compose**

Dans `infra/docker-compose.yml`, ajouter **avant** `services:` :
```yaml
x-node-service: &node-service
  image: node:22-bookworm
  working_dir: /app
  volumes:
    - ..:/app
  user: "1000:1000"
  restart: unless-stopped
```
et sous `services:` (après `rabbitmq-init`) :
```yaml
  auth:
    <<: *node-service
    command: ["npm", "run", "start", "-w", "@ccis/auth-service"]
    environment:
      HOME: /tmp
      DATABASE_URL: postgresql://auth_svc:${AUTH_DB_PASSWORD}@postgres:5432/auth
      JWT_PRIVATE_KEY_FILE: /app/infra/keys/jwt-private.pem
      PORT: "4001"
    depends_on:
      postgres:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "node", "-e", "fetch('http://127.0.0.1:4001/health/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
      interval: 5s
      timeout: 3s
      retries: 30

  yard:
    <<: *node-service
    command: ["npm", "run", "start", "-w", "@ccis/yard-service"]
    environment:
      HOME: /tmp
      DATABASE_URL: postgresql://yard_svc:${YARD_DB_PASSWORD}@postgres:5432/yard
      AMQP_URL: amqp://yard:${RABBITMQ_YARD_PASSWORD}@rabbitmq:5672
      PORT: "4002"
    depends_on:
      postgres:
        condition: service_healthy
      rabbitmq-init:
        condition: service_completed_successfully
    healthcheck:
      test: ["CMD", "node", "-e", "fetch('http://127.0.0.1:4002/health/live').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
      interval: 5s
      timeout: 3s
      retries: 30

  gateway:
    <<: *node-service
    command: ["npm", "run", "start", "-w", "@ccis/gateway"]
    environment:
      HOME: /tmp
      AUTH_URL: http://auth:4001
      YARD_URL: http://yard:4002
      AMQP_URL: amqp://gateway:${RABBITMQ_GATEWAY_PASSWORD}@rabbitmq:5672
      JWT_PUBLIC_KEY_FILE: /app/infra/keys/jwt-public.pem
      CORS_ORIGIN: ${CORS_ORIGIN}
      PORT: "4000"
    ports:
      - "127.0.0.1:${GATEWAY_PORT:-4000}:4000"
    depends_on:
      auth:
        condition: service_healthy
      yard:
        condition: service_healthy
```
`yard` utilise `/health/live` pour son healthcheck : un RabbitMQ indisponible ne doit pas empêcher la gateway de démarrer, puisque le yard fonctionne sans broker (spec § 7.1).

- [ ] **Step 2: Lancer, migrer, seeder**

```bash
npm run generate
npm run infra:up
docker compose -f infra/docker-compose.yml --env-file .env ps
DATABASE_URL=postgresql://auth_svc:auth-dev@127.0.0.1:5442/auth npm run seed -w @ccis/auth-service
DATABASE_URL=postgresql://yard_svc:yard-dev@127.0.0.1:5442/yard npm run seed -w @ccis/yard-service
curl -s http://127.0.0.1:4000/health/ready
```
Expected : `auth`, `yard`, `gateway` en état `healthy` / `running` ; seed affiche les 3 comptes puis `Seed : … conteneurs, 4 zones.` ; health `{"ok":true,"checks":{"broker":"ok"}}`.

- [ ] **Step 3: Script de fumée de bout en bout**

`infra/scripts/smoke.mjs` :
```js
// End-to-end check through the gateway: login → ws ticket → move → the move
// event comes back over the websocket (i.e. it went through outbox + RabbitMQ).
const GW = process.env.GATEWAY_URL ?? 'http://127.0.0.1:4000';

async function call(path, { method = 'GET', body, token } = {}) {
  const res = await fetch(GW + path, {
    method,
    headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${text}`);
  return text ? JSON.parse(text) : null;
}

const { accessToken: token } = await call('/auth/login', { method: 'POST', body: { email: 'operateur@ccis.mg', password: 'operateur123' } });
const { ticket } = await call('/ws-ticket', { method: 'POST', token });
const ws = new WebSocket(`${GW.replace('http', 'ws')}/ws?ticket=${ticket}`);
const frames = [];
ws.addEventListener('message', (e) => frames.push(JSON.parse(e.data)));
await new Promise((resolve, reject) => { ws.addEventListener('open', resolve); ws.addEventListener('error', reject); });

const zones = await call('/zones', { token });
const containers = await call('/containers', { token });
let move;
for (const z of zones) {
  const inZone = containers.filter((c) => c.zoneId === z.id);
  const top = inZone.find((c) => !inZone.some((o) => o.row === c.row && o.col === c.col && o.tier > c.tier));
  if (!top) continue;
  for (let r = 0; r < z.rows && !move; r++)
    for (let c = 0; c < z.cols && !move; c++)
      if (!inZone.some((o) => o.row === r && o.col === c)) move = { ct: top, toZoneId: z.id, toRow: r, toCol: c };
  if (move) break;
}
if (!move) throw new Error('aucun déplacement possible dans les données de démo');

const moved = await call(`/containers/${move.ct.id}/move`, {
  method: 'POST', token,
  body: { toZoneId: move.toZoneId, toRow: move.toRow, toCol: move.toCol, expectedVersion: move.ct.version },
});
const start = Date.now();
while (!frames.some((f) => f.event === 'yard.container.moved' && f.data.container.id === moved.id)) {
  if (Date.now() - start > 5000) throw new Error(`événement non reçu ; trames : ${JSON.stringify(frames)}`);
  await new Promise((r) => setTimeout(r, 50));
}
console.log(`OK : ${moved.containerNo} déplacé, événement reçu en ${Date.now() - start} ms`);
ws.close();
```

Run: `node infra/scripts/smoke.mjs`
Expected : `OK : XXXX1234567 déplacé, événement reçu en … ms`.

- [ ] **Step 4: Script de fumée « broker arrêté »**

`infra/scripts/smoke-broker-down.sh` :
```sh
#!/bin/sh
# RabbitMQ down: writes still succeed and pile up in the outbox; they are
# published once the broker is back.
set -eu
DC="docker compose -f infra/docker-compose.yml --env-file .env"
GW="${GATEWAY_URL:-http://127.0.0.1:4000}"
pending() { $DC exec -T postgres psql -U ccis -d yard -tAc 'SELECT count(*) FROM outbox WHERE "publishedAt" IS NULL'; }

TOKEN=$(curl -fsS -X POST "$GW/auth/login" -H 'content-type: application/json' \
  -d '{"email":"operateur@ccis.mg","password":"operateur123"}' | node -pe 'JSON.parse(require("fs").readFileSync(0)).accessToken')

$DC stop rabbitmq
curl -fsS -X POST "$GW/containers/arrival" -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"type":"FULL_20","zoneId":"C"}' >/dev/null
echo "Arrivée acceptée broker arrêté ; événements en attente : $(pending)"
[ "$(pending)" -ge 1 ]

$DC start rabbitmq
i=0
while [ "$(pending)" -ne 0 ]; do
  i=$((i + 1)); [ $i -le 60 ] || { echo "ÉCHEC : outbox non vidée"; exit 1; }
  sleep 1
done
echo "OK : outbox vidée après le retour de RabbitMQ"
```

Run: `chmod +x infra/scripts/smoke-broker-down.sh && sh infra/scripts/smoke-broker-down.sh`
Expected : `Arrivée acceptée broker arrêté ; événements en attente : 1` (ou plus), puis `OK : outbox vidée après le retour de RabbitMQ`.

- [ ] **Step 5: Commit**

```bash
git add infra
git commit -m "infra: run auth, yard and gateway in compose; end-to-end smoke scripts"
```

---

### Task 13: Front — temps réel fiable, versions, session expirée

**Files:**
- Modify: `web/src/api/client.js`, `web/src/api/ws.js`, `web/src/hooks/useAuth.js`, `web/src/hooks/useYardState.js`, `web/src/components/Header.jsx`, `web/src/components/LoginScreen.jsx`, `web/src/App.jsx`, `web/src/index.css`
- Create: `web/src/api/ws.test.js`

**Interfaces:**
- Consumes : gateway (`POST /ws-ticket`, `GET /ws?ticket=`, code de fermeture 4401, erreurs `{ code }`).
- Produces :
  - `client.js` : `onUnauthorized(fn): () => void`, `notifyUnauthorized(): void`, `ApiError.code`, `api.wsTicket()`, `api.containerDeparture(id, expectedVersion)`, `api.containerTransfer(id, targetZoneId, expectedVersion)`, `api.containerMove(id, toZoneId, toRow, toCol, expectedVersion)`
  - `ws.js` : `connectYardSocket({ getTicket, onEvent, onConnected, onStatus, onUnauthorized, WebSocketImpl?, wsUrl? }): () => void` ; statuts `'connected' | 'reconnecting' | 'disconnected'`
  - `useYardState` retourne en plus `connectionStatus`
  - `useAuth` retourne en plus `sessionExpired`

- [ ] **Step 1: Test du client WebSocket (échoue)**

`web/src/api/ws.test.js` :
```js
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { connectYardSocket } from './ws';

class FakeWebSocket {
  static instances = [];
  constructor(url) { this.url = url; FakeWebSocket.instances.push(this); }
  open() { this.onopen?.(); }
  message(obj) { this.onmessage?.({ data: JSON.stringify(obj) }); }
  serverClose(code = 1006) { this.onclose?.({ code }); }
  close() { this.closed = true; }
}

const flush = () => new Promise((r) => setTimeout(r, 0));

function setup(overrides = {}) {
  const calls = { statuses: [], connected: 0, events: [], unauthorized: 0, tickets: 0 };
  const disconnect = connectYardSocket({
    getTicket: async () => `t${++calls.tickets}`,
    onEvent: (e) => calls.events.push(e),
    onConnected: () => calls.connected++,
    onStatus: (s) => calls.statuses.push(s),
    onUnauthorized: () => calls.unauthorized++,
    WebSocketImpl: FakeWebSocket,
    wsUrl: 'ws://gw',
    ...overrides,
  });
  return { calls, disconnect };
}

beforeEach(() => { FakeWebSocket.instances = []; vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] }); });
afterEach(() => { vi.useRealTimers(); });

describe('connectYardSocket', () => {
  it('connects with a fresh ticket, reports connected and triggers a resync', async () => {
    const { calls } = setup();
    await vi.runOnlyPendingTimersAsync();
    await flush();
    const ws = FakeWebSocket.instances[0];
    expect(ws.url).toBe('ws://gw/ws?ticket=t1');
    ws.open();
    expect(calls.statuses.at(-1)).toBe('connected');
    expect(calls.connected).toBe(1);
    ws.message({ event: 'yard.container.moved', data: {} });
    expect(calls.events).toEqual([{ event: 'yard.container.moved', data: {} }]);
  });

  it('on loss: reconnecting, retries with a new ticket, resyncs again', async () => {
    const { calls } = setup();
    await flush();
    FakeWebSocket.instances[0].open();
    FakeWebSocket.instances[0].serverClose(1006);
    expect(calls.statuses.at(-1)).toBe('reconnecting');
    await vi.advanceTimersByTimeAsync(1000);
    await flush();
    const second = FakeWebSocket.instances[1];
    expect(second.url).toBe('ws://gw/ws?ticket=t2');
    second.open();
    expect(calls.connected).toBe(2);
    expect(calls.statuses.at(-1)).toBe('connected');
  });

  it('becomes disconnected after 30 s without connection and stays red while retrying', async () => {
    const { calls } = setup({ getTicket: async () => { throw new Error('network'); } });
    await flush();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(calls.statuses.at(-1)).toBe('disconnected');
    await vi.advanceTimersByTimeAsync(60_000);
    expect(calls.statuses.at(-1)).toBe('disconnected');
  });

  it('close code 4401: unauthorized, no retry', async () => {
    const { calls } = setup();
    await flush();
    FakeWebSocket.instances[0].open();
    FakeWebSocket.instances[0].serverClose(4401);
    expect(calls.unauthorized).toBe(1);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(FakeWebSocket.instances).toHaveLength(1);
  });

  it('a 401 while fetching the ticket stops without retrying', async () => {
    const err = Object.assign(new Error('401'), { status: 401 });
    const { calls } = setup({ getTicket: async () => { throw err; } });
    await flush();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(calls.tickets).toBe(0);
    expect(FakeWebSocket.instances).toHaveLength(0);
  });

  it('disconnect() stops everything', async () => {
    const { disconnect } = setup();
    await flush();
    const ws = FakeWebSocket.instances[0];
    ws.open();
    disconnect();
    expect(ws.closed).toBe(true);
    ws.serverClose(1006);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(FakeWebSocket.instances).toHaveLength(1);
  });
});
```

Run: `npm test -w @ccis/web`
Expected : FAIL (l'API actuelle de `connectYardSocket(token, onEvent)` ne correspond pas).

- [ ] **Step 2: Réécrire `web/src/api/ws.js`**

```js
const WS_URL = import.meta.env.VITE_WS_URL || `ws://${globalThis.location?.hostname ?? 'localhost'}:4000`;
const DISCONNECTED_AFTER_MS = 30_000;

// Status: 'connected' | 'reconnecting' | 'disconnected' (no connection for 30 s).
// onConnected fires on every (re)connection so the caller can resynchronise:
// events emitted while the socket was down are not replayed.
export function connectYardSocket({
  getTicket,
  onEvent,
  onConnected,
  onStatus,
  onUnauthorized,
  WebSocketImpl = globalThis.WebSocket,
  wsUrl = WS_URL,
}) {
  let socket = null;
  let closedByUser = false;
  let retryDelay = 1000;
  let retryTimer = null;
  let downTimer = null;
  let status = null;

  const setStatus = (s) => {
    status = s;
    onStatus?.(s);
  };

  // Once 'disconnected' (red), further failed retries keep it red.
  function markDown() {
    if (status !== 'disconnected') setStatus('reconnecting');
    if (!downTimer) downTimer = setTimeout(() => setStatus('disconnected'), DISCONNECTED_AFTER_MS);
  }

  function scheduleRetry() {
    if (closedByUser) return;
    retryTimer = setTimeout(open, retryDelay);
    retryDelay = Math.min(retryDelay * 2, 15000);
  }

  async function open() {
    retryTimer = null;
    let ticket;
    try {
      ticket = await getTicket();
    } catch (err) {
      // 401: the API client already logged the user out.
      if (err?.status === 401) return;
      markDown();
      scheduleRetry();
      return;
    }
    if (closedByUser) return;

    socket = new WebSocketImpl(`${wsUrl}/ws?ticket=${encodeURIComponent(ticket)}`);
    socket.onopen = () => {
      retryDelay = 1000;
      clearTimeout(downTimer);
      downTimer = null;
      setStatus('connected');
      onConnected?.();
    };
    socket.onmessage = (event) => {
      try {
        onEvent(JSON.parse(event.data));
      } catch {
        // malformed frame, ignore
      }
    };
    socket.onclose = (event) => {
      socket = null;
      if (closedByUser) return;
      if (event.code === 4401) {
        setStatus('disconnected');
        onUnauthorized?.();
        return;
      }
      markDown();
      scheduleRetry();
    };
  }

  markDown();
  open();

  return function disconnect() {
    closedByUser = true;
    clearTimeout(retryTimer);
    clearTimeout(downTimer);
    socket?.close();
  };
}
```

Run: `npm test -w @ccis/web`
Expected : 6 tests PASS.

- [ ] **Step 3: Modifier `web/src/api/client.js`**

Remplacer la ligne `const API_URL = …` par :
```js
const API_URL = import.meta.env.VITE_API_URL || `http://${globalThis.location?.hostname ?? 'localhost'}:4000`;
```
Après `export function setToken(token) { … }`, ajouter :
```js
let unauthorizedHandler = null;

// Registered by useAuth: any 401 on an authenticated call (or a websocket
// closed with 4401) means the session is over.
export function onUnauthorized(fn) {
  unauthorizedHandler = fn;
  return () => {
    if (unauthorizedHandler === fn) unauthorizedHandler = null;
  };
}

export function notifyUnauthorized() {
  setToken(null);
  unauthorizedHandler?.();
}
```
Dans `class ApiError`, après `this.status = status;`, ajouter `this.code = body?.code ?? null;`.
Dans `request`, remplacer `if (!res.ok) throw new ApiError(res.status, data);` par :
```js
  if (!res.ok) {
    if (res.status === 401 && auth) notifyUnauthorized();
    throw new ApiError(res.status, data);
  }
```
Dans l'objet `api`, remplacer les lignes `containerDeparture`, `containerTransfer`, `containerMove` par :
```js
  containerDeparture: (id, expectedVersion) =>
    request(`/containers/${id}/departure`, { method: 'POST', body: { expectedVersion } }),
  containerTransfer: (id, targetZoneId, expectedVersion) =>
    request(`/containers/${id}/transfer`, { method: 'POST', body: { targetZoneId, expectedVersion } }),
  containerMove: (id, toZoneId, toRow, toCol, expectedVersion) =>
    request(`/containers/${id}/move`, { method: 'POST', body: { toZoneId, toRow, toCol, expectedVersion } }),
```
et ajouter `wsTicket: () => request('/ws-ticket', { method: 'POST' }),` après `me: …`.

- [ ] **Step 4: Modifier `web/src/hooks/useAuth.js`**

Remplacer la première ligne d'import par :
```js
import { useState, useCallback, useEffect } from 'react';
import { api, getToken, setToken, onUnauthorized } from '../api/client';
```
(supprimer l'ancienne ligne `import { api, getToken, setToken } from '../api/client';`).
Après `const [checking, setChecking] = useState(!!getToken());`, ajouter :
```js
  const [sessionExpired, setSessionExpired] = useState(false);

  useEffect(
    () =>
      onUnauthorized(() => {
        setTok(null);
        setUser(null);
        setSessionExpired(true);
      }),
    [],
  );
```
Dans `login`, après `setUser(result.user);`, ajouter `setSessionExpired(false);`.
Remplacer `return { token, user, checking, login, logout };` par `return { token, user, checking, sessionExpired, login, logout };`.

- [ ] **Step 5: Modifier `web/src/components/LoginScreen.jsx`**

Remplacer `export default function LoginScreen({ onLogin }) {` par `export default function LoginScreen({ onLogin, notice }) {`.
Juste avant `{error && <div className="form-result error">{error}</div>}`, ajouter :
```jsx
          {notice && !error && <div className="form-result error">{notice}</div>}
```

- [ ] **Step 6: Modifier `web/src/hooks/useYardState.js`**

1. Remplacer `import { api, getToken } from '../api/client';` par `import { api, notifyUnauthorized } from '../api/client';`.
2. Dans `toUiContainer`, après `tier: c.tier,`, ajouter :
```js
    version: c.version,
    customsStatus: c.customsStatus,
```
3. Après `const [detailContainer, setDetailContainer] = useState(null);`, ajouter :
```js
  const [connectionStatus, setConnectionStatus] = useState('reconnecting');
```
4. Dans `refreshZones`, remplacer `setZones(data.map((z) => ({ id: z.id, label: z.label, rows: z.rows, cols: z.cols })));` par :
```js
    setZones(data.map((z) => ({ id: z.id, label: z.label, rows: z.rows, cols: z.cols, version: z.version })));
```
5. Après la définition de `refreshMovements`, ajouter :
```js
  const refreshAll = useCallback(async () => {
    try {
      await Promise.all([refreshZones(), refreshContainers(), refreshMovements()]);
    } catch (err) {
      if (err?.status !== 401) showToast('error', `Erreur de synchronisation : ${err.message}`);
    }
  }, [refreshZones, refreshContainers, refreshMovements, showToast]);

  const handleError = useCallback(
    (err) => {
      if (err?.code === 'VERSION_CONFLICT') {
        showToast('error', 'Modifié entre-temps par un autre utilisateur : affichage rechargé.');
        refreshAll();
        return;
      }
      if (err?.status === 401) return;
      showToast('error', err.message);
    },
    [showToast, refreshAll],
  );
```
6. Remplacer tout le bloc `useEffect` qui appelle `connectYardSocket(token, …)` par :
```js
  useEffect(() => {
    if (!enabled) return;
    const disconnect = connectYardSocket({
      getTicket: async () => (await api.wsTicket()).ticket,
      onEvent: (msg) => {
        // The per-depot dataset is small, so a full refetch on every event is
        // simpler and more robust than patching each shape incrementally.
        refreshContainers();
        refreshMovements();
        if (msg.event?.startsWith('yard.zone.')) refreshZones();
      },
      onConnected: refreshAll,
      onStatus: setConnectionStatus,
      onUnauthorized: notifyUnauthorized,
    });
    return disconnect;
  }, [enabled, refreshAll, refreshContainers, refreshMovements, refreshZones]);

  // Safety net while the websocket is down.
  useEffect(() => {
    if (!enabled || connectionStatus === 'connected') return;
    const id = setInterval(refreshAll, 60_000);
    return () => clearInterval(id);
  }, [enabled, connectionStatus, refreshAll]);
```
7. Dans `editZone`, remplacer `await api.updateZone(zoneId, { label: newLabel, rows: newRows, cols: newCols });` par :
```js
        const zone = zones.find((z) => z.id === zoneId);
        await api.updateZone(zoneId, { label: newLabel, rows: newRows, cols: newCols, expectedVersion: zone?.version });
```
et remplacer son tableau de dépendances `[showToast, refreshZones],` par `[showToast, refreshZones, zones, handleError],`.
8. Dans `containerDeparture`, remplacer `await api.containerDeparture(ct._dbId);` par `await api.containerDeparture(ct._dbId, ct.version);`.
9. Dans `containerTransfer`, remplacer `const updated = await api.containerTransfer(ct._dbId, targetZoneId);` par `const updated = await api.containerTransfer(ct._dbId, targetZoneId, ct.version);`.
10. Dans `executeMove`, remplacer `await api.containerMove(ct._dbId, toZone, toRow, toCol);` par `await api.containerMove(ct._dbId, toZone, toRow, toCol, ct.version);`.
11. Dans **toutes** les fonctions des sections ZONE MANAGEMENT, CONTAINER MOVEMENTS, DRAG & DROP MOVE, `undoMove`, COMPACT et REEFER, remplacer `showToast('error', err.message);` par `handleError(err);`, et ajouter `handleError` à leur tableau de dépendances `useCallback`.
12. Dans l'objet retourné, après `stats: { … },`, ajouter `connectionStatus,`.

Run: `grep -n "showToast('error', err.message)\|getToken" web/src/hooks/useYardState.js`
Expected : aucune ligne.

- [ ] **Step 7: Badge de connexion — `Header.jsx`, `index.css`, `App.jsx`**

`web/src/components/Header.jsx` : remplacer la signature par
```jsx
export default function Header({ user, connectionStatus, onLogout, onOpenZoneManager, onOpenMovementManager, onOpenDashboard, onOpenReeferMonitor }) {
```
ajouter avant `return (` :
```jsx
  const badge = {
    connected: { cls: '', label: 'En direct' },
    reconnecting: { cls: ' reconnecting', label: 'Reconnexion…' },
    disconnected: { cls: ' disconnected', label: 'Hors ligne' },
  }[connectionStatus] ?? { cls: ' reconnecting', label: 'Connexion…' };
```
et remplacer `<div className="live-badge"><div className="live-dot"></div> En direct</div>` par :
```jsx
        <div className={`live-badge${badge.cls}`}><div className="live-dot"></div> {badge.label}</div>
```

`web/src/index.css` : après la ligne `@keyframes pulse { … }`, ajouter :
```css
.live-badge.reconnecting { background: rgba(245,158,11,0.12); border-color: rgba(245,158,11,0.3); color: #f59e0b; }
.live-badge.reconnecting .live-dot { background: #f59e0b; }
.live-badge.disconnected { background: rgba(239,68,68,0.12); border-color: rgba(239,68,68,0.3); color: #ef4444; }
.live-badge.disconnected .live-dot { background: #ef4444; animation: none; }
```

`web/src/App.jsx` :
- remplacer `const { user, checking, login, logout } = useAuth();` par `const { user, checking, sessionExpired, login, logout } = useAuth();` ;
- dans la déstructuration de `useYardState(!!user)`, après `stats,`, ajouter `connectionStatus,` ;
- remplacer `return <LoginScreen onLogin={login} />;` par `return <LoginScreen onLogin={login} notice={sessionExpired ? 'Session expirée, reconnectez-vous.' : null} />;` ;
- dans `<Header`, ajouter la prop `connectionStatus={connectionStatus}`.

- [ ] **Step 8: Vérification dans le navigateur**

```bash
npm test -w @ccis/web
npm run build -w @ccis/web
npx --prefix web vite web --host 127.0.0.1 --port 5180 --strictPort
```
Dans le navigateur, sur `http://127.0.0.1:5180`, vérifier :
1. connexion `operateur@ccis.mg` / `operateur123` → plan du yard affiché, badge vert « En direct » ;
2. deux onglets ouverts : un déplacement par drag & drop dans l'un apparaît dans l'autre en moins de 2 s ;
3. `docker compose -f infra/docker-compose.yml --env-file .env stop gateway` → badge orange « Reconnexion… », rouge « Hors ligne » après 30 s ; `start gateway` → badge vert et données rechargées ;
4. dans la console du navigateur : `sessionStorage.setItem('ccis_access_token','x')` puis F5 → retour à l'écran de connexion ;
5. connexion en `lecteur@ccis.mg` / `lecteur123`, tentative de drag & drop → toast « Action réservée au rôle OPERATOR ».

- [ ] **Step 9: Commit**

```bash
git add web
git commit -m "feat(web): websocket tickets, real connection badge, resync on reconnect, optimistic versions, session expiry"
```

---

### Task 14: Retrait de l'ancien backend et documentation

**Files:**
- Delete: `backend/`
- Modify: `README.md`, `.gitignore`

- [ ] **Step 1: Supprimer l'ancien backend**

```bash
git rm -rq backend
rm -rf backend
```
Dans `.gitignore`, supprimer la ligne `backend/data/`.

- [ ] **Step 2: Mettre à jour le README**

Dans `README.md`, remplacer toute la section depuis `## Stack` jusqu'à la ligne `---` qui précède `## Fonctionnalités du prototype` par :
````markdown
## Architecture

Microservices (voir `docs/superpowers/specs/2026-10-25-architecture-microservices-design.md`) :

| Composant | Rôle | Port |
|---|---|---|
| `web/` | Front React 19 + Vite | 5180 |
| `services/gateway` | Point d'entrée : JWT, routage, WebSocket | 4000 |
| `services/auth` | Utilisateurs, connexion, JWT RS256 | interne 4001 |
| `services/yard` | Zones, conteneurs, mouvements, règles, outbox | interne 4002 |
| PostgreSQL 16 | Une base par service | 5442 |
| RabbitMQ 3.13 | Événements (`yard.events`…) | 5682 / 15682 |

## Démarrage

Prérequis : Node 22, Docker.

```bash
npm install
npm run generate                 # clients Prisma
cp .env.example .env
sh infra/scripts/gen-keys.sh     # clés JWT de développement
npm run infra:up                 # Postgres, RabbitMQ, auth, yard, gateway
DATABASE_URL=postgresql://auth_svc:auth-dev@127.0.0.1:5442/auth npm run seed -w @ccis/auth-service
DATABASE_URL=postgresql://yard_svc:yard-dev@127.0.0.1:5442/yard npm run seed -w @ccis/yard-service
npx --prefix web vite web --host 127.0.0.1 --port 5180
```

Comptes de démo : `admin@ccis.mg` / `admin123` (ADMIN), `operateur@ccis.mg` / `operateur123` (OPERATOR), `lecteur@ccis.mg` / `lecteur123` (VIEWER).

Interface RabbitMQ : http://127.0.0.1:15682 (`admin` / `admin-dev`).

## Tests

```bash
npm test                               # tous les packages (Docker requis : Testcontainers)
node infra/scripts/smoke.mjs           # bout en bout via la gateway
sh infra/scripts/smoke-broker-down.sh  # RabbitMQ arrêté : aucune perte
```

---
````

- [ ] **Step 3: Vérification finale complète**

```bash
npm test
npm run typecheck
node infra/scripts/smoke.mjs
sh infra/scripts/smoke-broker-down.sh
```
Expected : tous les tests PASS, aucune erreur de typage, les deux scripts de fumée affichent `OK`.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: remove in-memory backend, document the microservices setup"
```
