# CCIS Yard View — Architecture microservices, base de données et messagerie

- **Date** : 2026-10-25
- **Statut** : à valider
- **Périmètre** : backend complet (remplace `backend/` en mémoire), intégration CargoWise bidirectionnelle, télémétrie reefer IoT, ajustements du front

---

## 1. Contexte et objectifs

Le front React (`src/`) attend une API REST + WebSocket. Le backend actuel (`backend/`) est un prototype Fastify en mémoire persisté dans un fichier JSON, sans garantie de livraison des événements, mono-processus.

Le backlog prévoit l'intégration **CargoWise** (E11-03), les **capteurs de température reefer** (E7-06) et la **gestion des conflits multi-utilisateurs** (E11-04).

### Objectifs

1. Toute donnée du yard est stockée dans une **vraie base de données** (PostgreSQL), de façon transactionnelle.
2. Tout changement d'état est **publié de façon garantie** vers les systèmes intéressés via une **queue** (RabbitMQ) : aucun mouvement perdu, même si le broker, un service ou CargoWise est momentanément indisponible.
3. **Intégration CargoWise bidirectionnelle** :
   - sortant : gate-in, gate-out, changements de position ;
   - entrant : pré-avis d'arrivée, mises à jour de conteneurs (client, sortie prévue, statut douane), ordres de sortie et de transfert.
4. **Télémétrie reefer** reçue en MQTT, historisée, avec alertes automatiques.
5. **Temps réel fiable** côté écrans : resynchronisation après coupure, état de connexion visible, session expirée gérée.
6. Une panne de CargoWise, du connecteur ou de la télémétrie **n'empêche jamais** les opérateurs de travailler sur le yard.

### Hors périmètre

- Branchement au vrai CargoWise : pas d'accès à ce jour. Le connecteur est construit derrière une interface et testé contre un **CargoWise simulé**.
- Passerelles IoT physiques : un **simulateur de capteurs** publie en MQTT exactement comme le ferait un capteur.
- Hébergement de production, haute disponibilité de Postgres/RabbitMQ, sauvegardes.
- Refresh tokens, SSO.

### Décisions validées

| Sujet | Décision |
|---|---|
| Architecture | Microservices, chaque service possède sa base |
| Authentification | Service dédié `auth-service`, JWT RS256 |
| Base de données | PostgreSQL 16, ORM Prisma, une base par service |
| Messagerie | RabbitMQ (AMQP 0-9-1) avec plugin MQTT pour les capteurs |
| Flux CargoWise | Bidirectionnel : pré-avis, mises à jour et ordres entrants ; mouvements sortants |
| Accès CargoWise | Aucun pour l'instant, simulateur eAdaptor |
| IoT | Inclus dans ce chantier |
| Langage | TypeScript pour services et packages ; le front reste en JavaScript |
| Organisation | Une seule spec, implémentation en 4 phases |

---

## 2. Services et propriété des données

```
              Navigateur (front React)
                    │  REST + WebSocket
              ┌─────▼──────┐        ┌──────────────┐
              │  gateway   │──REST──► auth-service │ [db: auth]
              └─┬────┬───┬─┘        └──────────────┘
       REST     │    │   │
   ┌────────────▼┐ ┌─▼───▼───────────┐ ┌──────────────────┐
   │yard-service │ │cargowise-service│ │telemetry-service │
   │ [db: yard]  │ │ [db: cargowise] │ │ [db: telemetry]  │
   └──────┬──────┘ └───────┬─────────┘ └────────┬─────────┘
          │                │ AMQP               │
          └────────────────┴──────┬─────────────┘
                           ┌──────▼──────┐  MQTT  ┌───────────┐
                           │  RabbitMQ   │◄───────┤ sensor-sim│
                           └─────────────┘        └───────────┘
              cargowise-sim ◄──HTTP (XML eAdaptor)──► cargowise-service
```

**Règle centrale** : un service = un domaine = sa base. Aucun service ne lit ni n'écrit la base d'un autre. Les échanges passent uniquement par HTTP (requêtes synchrones via la gateway ou API internes) ou par messages RabbitMQ.

| Service | Responsabilités | Ne fait pas |
|---|---|---|
| **auth-service** | Utilisateurs, rôles, hachage des mots de passe, émission des JWT, limitation des tentatives de connexion | Aucune autorisation métier fine (portée par chaque service) |
| **gateway** | Point d'entrée unique du front. Vérifie le JWT, route vers les services, émet les tickets WebSocket, diffuse les événements aux navigateurs | Aucune règle métier, aucune base métier (état en mémoire uniquement : tickets WS) |
| **yard-service** | Zones, conteneurs, piles, mouvements, règles d'empilement, compactage, annulation, pré-avis, ordres de travail, statut douane, **copie du dernier état reefer** | Ne connaît pas CargoWise (manipule des « références externes » génériques), ne stocke pas l'historique de télémétrie |
| **cargowise-service** | Traduction XML eAdaptor ↔ messages internes, journal de tous les échanges, envoi ordonné et retries vers CargoWise, réception des messages CargoWise, correspondance des références | Ne modifie jamais le yard directement : il envoie des **commandes** que `yard-service` accepte ou refuse |
| **telemetry-service** | Ingestion des relevés MQTT, historique, seuils, alertes (avec hystérésis), purge | Ne connaît pas les positions dans le yard |
| **cargowise-sim** | Simulateur eAdaptor : reçoit les événements sortants, envoie pré-avis, mises à jour et ordres (scénarios scriptés et déclenchement manuel via une petite API) | — |
| **sensor-sim** | Simule un capteur par reefer présent au yard, publie en MQTT | — |

### Autorisations (vérifiées dans chaque service à partir de `x-user-role`)

| Rôle | Droits |
|---|---|
| `VIEWER` | Lecture seule |
| `OPERATOR` | Mouvements, compactage, réglages reefer, exécution des tâches |
| `ADMIN` | Tout, plus la gestion des zones, des utilisateurs et le journal d'intégration (dont « Rejouer ») |

---

## 3. Messagerie

### 3.1 Événements et commandes

- **Événement** : un fait passé, publié par le service propriétaire, consommé par zéro ou plusieurs services. Exchanges *topic* durables : `yard.events`, `cargowise.events`, `telemetry.events`.
- **Commande** : une demande adressée à un seul service, qui peut la refuser. Exchange *direct* durable `yard.commands`. Le résultat est toujours publié sous forme d'événement (succès métier ou `yard.command.rejected`), corrélé par `correlationId`.

Nommage des routing keys : `<domaine>.<objet>.<action>`, au passé pour les événements, à l'impératif pour les commandes.

### 3.2 Enveloppe

```jsonc
{
  "id": "0b7f…",                     // UUID v7, clé d'idempotence
  "type": "yard.container.moved",
  "version": 1,                      // version du schéma de data
  "occurredAt": "2026-10-25T14:00:00.000Z",
  "source": "yard-service",
  "correlationId": "…",              // chaîne métier complète
  "causationId": "…",                // id du message qui a causé celui-ci
  "aggregateId": "…",                // ex. id du conteneur
  "aggregateVersion": 7,             // version de l'agrégat après le changement
  "actor": { "userId": "…", "role": "OPERATOR" },  // null pour les actions système
  "data": { }
}
```

Les schémas de `data` sont définis avec zod dans `packages/contracts`. Tout message publié est validé avant écriture dans l'outbox ; tout message consommé est validé à la réception (un message invalide part directement en file de parking).

Règle d'évolution : un changement compatible (ajout d'un champ optionnel) garde la version ; un changement incompatible crée la version N+1, publiée en parallèle de N tant qu'un consommateur dépend de N.

### 3.3 Catalogue

**Événements `yard.events`**

| Type | Déclencheur | Consommateurs |
|---|---|---|
| `yard.container.arrived` | Gate-in | gateway, cargowise, telemetry (si reefer) |
| `yard.container.departed` | Gate-out | gateway, cargowise, telemetry |
| `yard.container.moved` | Déplacement (drag & drop) | gateway, cargowise |
| `yard.container.transferred` | Transfert de zone | gateway, cargowise |
| `yard.container.relocated` | Compactage (un événement par conteneur déplacé) ou annulation d'un déplacement | gateway, cargowise |
| `yard.container.info-updated` | Mise à jour client / sortie prévue / statut douane | gateway |
| `yard.reefer.configured` | Arrivée d'un reefer, changement de consigne ou de plage | telemetry, gateway |
| `yard.reefer.state-updated` | Copie de l'état reefer mise à jour (relevé, alerte, alimentation) | gateway |
| `yard.zone.created` / `.updated` / `.deleted` | Gestion des zones | gateway |
| `yard.preadvice.created` / `.fulfilled` / `.cancelled` | Pré-avis | gateway, cargowise |
| `yard.workorder.created` / `.completed` / `.cancelled` | Ordres de travail | gateway, cargowise |
| `yard.command.rejected` | Commande refusée (motif + code) | cargowise |

**Commandes `yard.commands`** (émises par `cargowise-service`)

| Type | Effet |
|---|---|
| `yard.preadvice.create` | Crée un pré-avis (idempotent sur `externalRef`) |
| `yard.preadvice.cancel` | Annule un pré-avis non réalisé |
| `yard.container.update-info` | Met à jour client, sortie prévue, statut douane d'un conteneur présent ou d'un pré-avis |
| `yard.workorder.create` | Crée un ordre `DEPARTURE` ou `TRANSFER` (idempotent sur `externalRef`) |
| `yard.workorder.cancel` | Annule un ordre encore `OPEN` |

**Événements `cargowise.events`** : `cargowise.message.received`, `cargowise.message.sent`, `cargowise.message.failed`, `cargowise.message.replayed` (consommés par la gateway pour le journal d'intégration en direct).

**Événements `telemetry.events`** : `telemetry.reading.recorded` (au plus un par conteneur toutes les 30 s), `telemetry.alert.raised`, `telemetry.alert.cleared` (consommés par yard-service et la gateway).

### 3.4 Garanties de livraison

- **Outbox** (chaque service producteur) :
  - table `outbox` écrite dans la même transaction que la donnée métier ;
  - un relais, dans le processus du service, lit les lignes non publiées par lots (`FOR UPDATE SKIP LOCKED`, toutes les 250 ms, et immédiatement après un commit via `LISTEN/NOTIFY`) ;
  - il publie avec *publisher confirms* et marque la ligne `publishedAt`.
  Lignes publiées purgées après 7 jours.
- **Inbox** (chaque consommateur) : table `inbox(consumer, messageId)` avec clé primaire composée, insérée dans la même transaction que l'effet. Un message déjà présent est acquitté sans effet. Livraison **au moins une fois**, effet **exactement une fois**.
- **Retries** : sur erreur technique, le message est republié dans une file à délai (TTL + dead-letter vers la file d'origine), avec des délais de 5 s, 30 s, 5 min et 30 min. Au 5e échec, ou immédiatement pour une erreur non récupérable (schéma invalide), il part dans `<file>.parking`. Les files de parking sont visibles dans le journal d'intégration (admin) et rejouables.
- **Ordre** : l'ordre global n'est pas garanti par RabbitMQ en cas de retry. Les consommateurs qui en ont besoin s'appuient sur `aggregateVersion` :
  - **cargowise-service** stocke chaque événement sortant et n'envoie le message d'un conteneur que lorsque le précédent (version inférieure) a été acquitté par CargoWise ;
  - **yard-service** ignore un relevé de télémétrie plus ancien que celui déjà connu.

### 3.5 Files

| File | Liée à | Consommateur |
|---|---|---|
| `cargowise.yard-events` | `yard.events` : `yard.container.*`, `yard.preadvice.*`, `yard.workorder.*`, `yard.command.rejected` | cargowise-service |
| `yard.commands` | `yard.commands` : `yard.#` | yard-service |
| `yard.telemetry-events` | `telemetry.events` : `telemetry.#` | yard-service |
| `telemetry.yard-events` | `yard.events` : `yard.reefer.configured`, `yard.container.arrived`, `yard.container.departed` | telemetry-service |
| `telemetry.sensor-readings` | `amq.topic` : `sensors.reefer.*.telemetry` (MQTT) | telemetry-service |
| `gateway.<instance>` (exclusive, auto-delete) | les trois exchanges d'événements, `#` | gateway |

Toutes les files durables sont des *quorum queues*. `telemetry.sensor-readings` est plafonnée à 500 000 messages (`overflow: reject-publish`) pour protéger le disque si la télémétrie est arrêtée longtemps.

### 3.6 MQTT

- Plugin `rabbitmq_mqtt` activé.
- Topic de publication : `sensors/reefer/{containerNo}/telemetry`, QoS 1.
- Charge utile JSON : `{ "readAt", "temperature", "powerStatus": "on"|"off", "humidity" }`.
- Identifiants par capteur. Permission de topic limitée à `sensors.reefer.{containerNo}.telemetry` ; en développement, `sensor-sim` dispose d'un utilisateur unique autorisé sur `sensors.reefer.*.telemetry`.

---

## 4. Flux métier

### 4.1 Sortant : mouvement du yard → CargoWise

1. L'opérateur effectue une action (arrivée, départ, déplacement, transfert, compactage, annulation) ; la requête passe par la gateway jusqu'à `yard-service`.
2. `yard-service` vérifie les règles et la `version`. Dans une transaction, il écrit le conteneur, le `Movement` et l'événement en outbox.
3. Le relais publie. La gateway pousse l'événement aux navigateurs ; `cargowise-service` le consomme.
4. `cargowise-service` crée un `CwMessage` `OUT` / `PENDING` (unique sur `sourceEventId`) contenant le XML eAdaptor généré.
5. L'émetteur, une boucle dans `cargowise-service`, envoie les messages `PENDING` dont l'échéance est atteinte, **dans l'ordre de `aggregateVersion` pour chaque conteneur**. HTTP 2xx → `SENT` + `cargowise.message.sent`. Erreur → `attempts+1`, `nextAttemptAt` après 5 s, 30 s, 5 min, 30 min, puis toutes les 2 h. Après 8 tentatives (environ 9 h) → `FAILED` + `cargowise.message.failed`, et les messages suivants du même conteneur restent bloqués jusqu'à résolution (rejeu ou abandon explicite par un admin).

Correspondance événement interne → message CargoWise :

| Événement yard | Message CargoWise |
|---|---|
| `yard.container.arrived` | Événement « gate-in » (référence du pré-avis si l'arrivée en réalise un) |
| `yard.container.departed` | Événement « gate-out » (référence de l'ordre de sortie le cas échéant) |
| `yard.container.moved` / `.transferred` / `.relocated` | Événement « changement de position » |
| `yard.workorder.completed` / `.cancelled` | Confirmation d'exécution / d'annulation de l'ordre |
| `yard.command.rejected` | Rejet du message entrant d'origine, avec motif |

Les codes d'événements CargoWise réels et la structure XML exacte (Universal Event / Universal Shipment) sont isolés dans `services/cargowise/src/mapping/`. Ils seront fixés à l'obtention de l'accès eAdaptor ; le simulateur utilise la même couche de traduction.

### 4.2 Entrant : CargoWise → yard

1. CargoWise (simulé) appelle `POST /eadaptor/inbound` sur `cargowise-service`, authentifié en HTTP Basic avec une liste d'IP autorisées configurable.
2. `cargowise-service` enregistre le XML brut dans `CwMessage` (`IN` / `PENDING`) **puis** répond 200. Le message est désormais en sécurité, quel que soit le sort du traitement.
3. Un processeur interne parse le XML (sans entités externes), identifie le type et le traduit en commande `yard.*`, envoyée via l'outbox de `cargowise-service` avec `correlationId` = id du `CwMessage`.
4. `yard-service` exécute la commande. Succès → événement métier (`yard.preadvice.created`, `yard.workorder.created`…) ; refus → `yard.command.rejected` avec code et motif.
5. `cargowise-service` met à jour le `CwMessage` : `PROCESSED`, ou `REJECTED` avec motif. Un refus déclenche aussi l'envoi d'un rejet à CargoWise (§ 4.1).

Effets dans le yard :

| Message entrant | Effet |
|---|---|
| Pré-avis | `PreAdvice` `EXPECTED`. Le formulaire d'arrivée propose la liste des attendus. Choisir un attendu pré-remplit numéro, type, client, poids et sortie prévue. À l'arrivée d'un conteneur dont le numéro correspond à un pré-avis `EXPECTED`, le pré-avis passe `FULFILLED`, même s'il a été saisi à la main. |
| Mise à jour | Met à jour `client`, `plannedExitDate`, `customsStatus` du conteneur présent, ou du pré-avis s'il n'est pas encore arrivé. Inconnu → refus `NOT_FOUND`. |
| Ordre de sortie / transfert | `WorkOrder` `OPEN`, visible dans l'écran **Tâches**. Le conteneur doit être présent (sinon refus), ou faire l'objet d'un pré-avis `EXPECTED` : l'ordre reste `OPEN` mais « Exécuter » n'est disponible qu'après l'arrivée. |
| Annulation d'ordre | `WorkOrder` → `CANCELLED` si `OPEN`, sinon refus `RULE_VIOLATION`. |

**Exécution des tâches** :
- depuis l'écran Tâches, « Exécuter » lance le départ, ou le transfert vers la zone cible avec placement automatique, en passant le `workOrderId` ;
- si l'opérateur fait le même mouvement manuellement, `yard-service` le rattache à l'ordre `OPEN` correspondant (même conteneur, même nature, même zone cible pour un transfert).
Dans les deux cas : `WorkOrder` → `COMPLETED`, lié au `Movement`.

**Règle douane** : un départ, manuel ou par tâche, est refusé (`RULE_VIOLATION`, « conteneur bloqué en douane ») si `customsStatus = HOLD`. Valeurs : `RELEASED` (défaut), `HOLD`.

### 4.3 Télémétrie reefer

1. `sensor-sim` interroge toutes les 60 s `GET /internal/reefers` de `yard-service` (réseau interne, jeton de service) pour connaître les reefers présents et leur consigne. Il publie un relevé par reefer toutes les 30 s : dérive autour de la consigne, rares écarts hors plage, coupures d'alimentation occasionnelles.
2. `telemetry-service` consomme `telemetry.sensor-readings` :
   - ignore les doublons (unicité sur conteneur + `readAt`) ;
   - stocke le relevé ;
   - évalue l'alerte selon le `Threshold` du conteneur (connu par `yard.reefer.configured`). Relevé d'un conteneur sans seuil → stocké sans évaluation.
   - au départ du conteneur (`yard.container.departed`), le seuil passe inactif et les alertes ouvertes sont closes.
3. **Hystérésis** :
   - alerte `TEMP_HIGH` / `TEMP_LOW` levée après **2 relevés consécutifs** hors plage ;
   - alerte `POWER_OFF` levée dès le premier relevé `off` ;
   - clôture au premier relevé revenu dans la plage avec alimentation `on`.
   Une seule alerte ouverte par conteneur et par motif.
4. `telemetry-service` publie `telemetry.reading.recorded` (dernier relevé, au plus un toutes les 30 s par conteneur) et `telemetry.alert.raised` / `.cleared`.
5. `yard-service` met à jour `ReeferState` (en ignorant les relevés plus anciens que le dernier connu) et publie `yard.reefer.state-updated`.
6. À l'écran : une donnée de plus de 5 min est marquée « donnée ancienne ». L'historique s'affiche dans la fiche conteneur via `GET /telemetry/containers/{containerNo}/readings?from&to`, routé par la gateway.
7. Un réglage manuel (consigne, alimentation) passe par `yard-service`, qui publie `yard.reefer.configured`.

---

## 5. Modèles de données

Chaque service a son `prisma/schema.prisma`, ses migrations et les tables techniques `outbox` et `inbox` :
- `outbox` : id, type, routingKey, payload jsonb, createdAt, publishedAt, attempts ;
- `inbox` : consumer, messageId, processedAt.

### 5.1 auth

| Table | Champs |
|---|---|
| `User` | id, email (unique, insensible à la casse), name, role (`ADMIN`/`OPERATOR`/`VIEWER`), passwordHash (argon2id), active, createdAt, updatedAt, lastLoginAt |

### 5.2 yard

| Table | Champs | Contraintes |
|---|---|---|
| `Zone` | id (1–4 caractères), label, rows, cols, version, createdAt | — |
| `Container` | id, containerNo, type (`EMPTY_20`, `EMPTY_40`, `FULL_20`, `FULL_40`, `REEFER`, `REEFER_FULL`), isoCode, client, weightKg, zoneId, row, col, tier, entryDate, plannedExitDate, exitDate, customsStatus, status (`PRESENT`/`DEPARTED`), version | Index unique partiel sur `containerNo` où `status = PRESENT`. Index unique partiel sur `(zoneId, row, col, tier)` où `status = PRESENT`. |
| `ReeferState` | containerId (PK), commodity, setPoint, tempMin, tempMax, powerStatus, ventSetting, humidity, currentTemp, lastReadingAt, alert, alertReason | — |
| `Movement` | id, type (`ARRIVAL`/`DEPARTURE`/`TRANSFER`/`MOVE`/`COMPACT`), containerId, from*, to*, userId, workOrderId, createdAt, undoneAt, undoneBy | Index sur `createdAt desc` |
| `PreAdvice` | id, externalRef (unique), containerNo, type, client, weightKg, expectedAt, plannedExitDate, customsStatus, status (`EXPECTED`/`FULFILLED`/`CANCELLED`), containerId, createdAt | — |
| `WorkOrder` | id, externalRef (unique), kind (`DEPARTURE`/`TRANSFER`), containerNo, targetZoneId, dueAt, status (`OPEN`/`COMPLETED`/`CANCELLED`), movementId, createdAt, completedAt | — |

Règles reprises du prototype : 3 niveaux maximum ; un 40' jamais sur un 20' ; seul le sommet d'une pile se déplace ; zone non supprimable si non vide, non réductible si des conteneurs sortent des nouvelles dimensions ; annulation d'un déplacement seulement si le conteneur n'a pas bougé depuis et reste au sommet. Le compactage reprend l'algorithme actuel : 40' puis 20', sortie la plus tardive en bas.

**Verrouillage optimiste** : `Container.version` et `Zone.version` sont incrémentées à chaque modification. Les requêtes de modification acceptent `expectedVersion`. En cas d'écart, réponse `409 VERSION_CONFLICT`. Les écritures concurrentes sur le même emplacement sont arbitrées par l'index unique : la seconde reçoit `409 RULE_VIOLATION` (« emplacement occupé »).

### 5.3 cargowise

| Table | Champs | Contraintes |
|---|---|---|
| `CwMessage` | id, direction (`IN`/`OUT`), kind, status (`PENDING`/`SENT`/`PROCESSED`/`FAILED`/`REJECTED`/`ABANDONED`), containerNo, aggregateVersion, payloadXml, sourceEventId, attempts, nextAttemptAt, lastError, correlationId, createdAt, sentAt, processedAt | `sourceEventId` unique. Index sur `(status, nextAttemptAt)` et `(containerNo, aggregateVersion)`. |
| `ReferenceMap` | cwRef, kind (`PREADVICE`/`WORKORDER`/`CONTAINER`), yardId, createdAt | Unique sur `(kind, cwRef)` |

### 5.4 telemetry

| Table | Champs | Contraintes |
|---|---|---|
| `Reading` | id (bigserial), containerNo, readAt, temperature, powerStatus, humidity, receivedAt | Unique sur `(containerNo, readAt)`. Purge quotidienne > 90 jours. |
| `Threshold` | containerNo (PK), setPoint, tempMin, tempMax, active, updatedAt | — |
| `Alert` | id, containerNo, reason (`TEMP_HIGH`/`TEMP_LOW`/`POWER_OFF`), raisedAt, clearedAt, consecutiveCount | Unique partiel sur `(containerNo, reason)` où `clearedAt is null` |

---

## 6. API exposée par la gateway

La gateway conserve **exactement** les routes actuelles du front (`src/api/client.js`) et en ajoute :

| Méthode | Route | Service | Rôle minimal |
|---|---|---|---|
| POST | `/auth/login`, GET `/auth/me` | auth | — / VIEWER |
| POST | `/ws-ticket` → `{ ticket }` (usage unique, 30 s) | gateway | VIEWER |
| GET | `/ws?ticket=…` | gateway | — |
| * | `/zones…`, `/containers…`, `/movements…` (inchangées, plus `expectedVersion`) | yard | selon § 2 |
| GET | `/preadvices?status=EXPECTED` | yard | VIEWER |
| GET | `/workorders?status=OPEN` | yard | VIEWER |
| POST | `/workorders/:id/execute` | yard | OPERATOR |
| GET | `/telemetry/containers/:containerNo/readings` | telemetry | VIEWER |
| GET | `/integration/messages?direction&status` | cargowise | ADMIN |
| POST | `/integration/messages/:id/replay`, `/integration/messages/:id/abandon` | cargowise | ADMIN |
| GET | `/integration/parking`, POST `/integration/parking/:queue/replay` | gateway (API management RabbitMQ) | ADMIN |

Frames WebSocket : `{ event, data, at }`, où `event` est le `type` de l'enveloppe, filtré aux types utiles au front.

---

## 7. Pannes, sécurité, observabilité

### 7.1 Comportement en cas de panne

| Panne | Effet pour l'opérateur | Comportement système |
|---|---|---|
| RabbitMQ arrêté | Travail normal ; badge orange, rechargement toutes les 60 s | Les outbox s'accumulent, publication au retour |
| `cargowise-service` arrêté | Aucun | Les messages attendent dans les files |
| CargoWise injoignable | Aucun ; l'admin voit les messages en attente | Retries (§ 4.1), puis `FAILED` + rejeu |
| `telemetry-service` arrêté | Reefers marqués « donnée ancienne » après 5 min | Relevés conservés dans la file plafonnée |
| Base d'un service arrêtée | Fonctions de ce service en erreur claire, le reste fonctionne | Gateway : `503 SERVICE_UNAVAILABLE` après 5 s de timeout |
| `auth-service` arrêté | Les sessions ouvertes continuent ; les nouvelles connexions échouent | La vérification JWT est locale (clé publique) |
| Message impossible à traiter | Aucun | File de parking après 5 tentatives |

Format d'erreur HTTP unique : `{ "error": "message lisible en français", "code": "…", "correlationId": "…" }`.

Codes : `VALIDATION` (400), `UNAUTHORIZED` (401), `FORBIDDEN` (403), `NOT_FOUND` (404), `RULE_VIOLATION` (409), `VERSION_CONFLICT` (409), `RATE_LIMITED` (429), `SERVICE_UNAVAILABLE` (503), `INTERNAL` (500).

### 7.2 Sécurité

- Seule la gateway, et l'endpoint inbound de `cargowise-service` en production, sont exposés. Services, bases et API internes restent sur le réseau Docker interne.
- JWT RS256, durée 12 h, `sub` = userId, `role`. Clé privée détenue par `auth-service` seul ; clé publique distribuée par configuration.
- Mots de passe argon2id. Login limité à 5 tentatives par minute par IP et par email.
- La gateway supprime tout en-tête `x-user-*` entrant, puis injecte `x-user-id`, `x-user-role`, `x-correlation-id` vers les services.
- **Ticket WebSocket** à usage unique : aucun JWT dans les URL. Les URL journalisées sont expurgées des paramètres `ticket` et `token`.
- **Inbound CargoWise** : HTTP Basic, liste d'IP autorisées, corps limité à 5 Mo, parseur XML sans DTD ni entités externes.
- **RabbitMQ** : un utilisateur par service, permissions limitées à ses exchanges et files ; utilisateurs MQTT limités à leur topic.
- **API internes** (`/internal/*`) : jeton de service partagé, accessibles uniquement sur le réseau interne.
- Secrets dans `.env` (non versionné). `.env.example` versionné. Les clés JWT de développement sont générées par un script d'initialisation, jamais versionnées.

### 7.3 Observabilité

- Logs JSON (pino), un objet par ligne, avec `service`, `correlationId`, `messageId`, `userId`. Le `correlationId` est créé par la gateway ou repris de l'en-tête `x-correlation-id`, et propagé dans les enveloppes et vers CargoWise.
- `/health/live` (processus vivant) et `/health/ready` (base + broker joignables) sur chaque service, utilisés par les healthchecks Docker Compose.
- `/metrics` (prom-client) : requêtes HTTP (durée, statut), arriéré d'outbox, âge du plus vieux message non publié, messages consommés / en erreur, taille des files de parking, `CwMessage` par statut, relevés reçus par seconde, alertes ouvertes.
- Interface d'administration RabbitMQ disponible en développement.

### 7.4 Temps réel côté front

1. À chaque (re)connexion WebSocket, rechargement complet des zones, conteneurs, mouvements, pré-avis et tâches.
2. Badge « En direct » piloté par l'état réel : vert (connecté), orange (reconnexion), rouge (déconnecté depuis plus de 30 s).
3. 401 sur une requête REST, ou fermeture WebSocket avec le code 4401 → déconnexion et retour à l'écran de login avec le message « Session expirée ».
4. Tant que le WebSocket est coupé, rechargement toutes les 60 s.
5. Les requêtes de modification envoient `expectedVersion`. Sur `409 VERSION_CONFLICT`, toast « modifié par un autre utilisateur » et rechargement.

---

## 8. Front : changements

- `src/api/client.js` : ajout de `expectedVersion`, des routes pré-avis, tâches, télémétrie, intégration ; gestion centralisée du 401.
- `src/api/ws.js` : ticket WebSocket, callbacks d'état de connexion, gestion du code 4401.
- `useYardState` : `version` dans le modèle conteneur, rechargement à la reconnexion, polling de secours, état de connexion exposé.
- `Header` : badge de connexion réel ; boutons « Tâches » (OPERATOR+) et « Intégration » (ADMIN).
- `MovementManager` (arrivée) : sélection d'un attendu qui pré-remplit le formulaire ; affichage du statut douane, départ désactivé si `HOLD`.
- Nouveaux composants :
  - `TaskList` : tâches ouvertes, exécution, filtres ;
  - `IntegrationLog` : messages CargoWise, files de parking, rejeu, abandon ;
  - `ReeferHistoryChart` : courbe des relevés avec la plage de consigne, dans `DetailPanel`.
- `ReeferMonitor` / `DetailPanel` : mention « donnée ancienne ».

---

## 9. Organisation du code

```
ccis-yard-view/
├── web/                        # front React (déplacé depuis la racine)
├── services/
│   ├── auth/  gateway/  yard/  cargowise/  telemetry/
│   │   └── src/, prisma/, test/, Dockerfile, package.json
├── simulators/
│   ├── cargowise-sim/
│   └── sensor-sim/
├── packages/
│   ├── contracts/              # schémas zod + types des enveloppes, événements, commandes
│   ├── messaging/              # connexion AMQP, outbox relay, inbox, topologie retry/parking
│   └── service-kit/            # bootstrap Fastify, logger, erreurs, health, metrics, identité
├── infra/
│   ├── docker-compose.yml
│   ├── rabbitmq/definitions.json, rabbitmq.conf, enabled_plugins
│   ├── postgres/init.sql
│   └── scripts/gen-keys.sh
├── docs/
└── package.json                # workspaces npm
```

- **Stack** : Node 22, TypeScript 5 (strict), Fastify 5, Prisma 6, amqplib, mqtt.js (simulateur), zod, pino, argon2, fast-xml-parser, prom-client, Vitest, Testcontainers, Playwright.
- `packages/*` ne contient **aucune règle métier**.
- Le dossier `backend/` actuel est supprimé à la fin de la phase 1 ; ses règles sont portées dans `services/yard`.

### Ports de développement (hôte)

| Composant | Port |
|---|---|
| Front (Vite) | 5180 |
| gateway | 4000 |
| cargowise-sim (API de pilotage) | 4100 |
| PostgreSQL | 5442 |
| RabbitMQ AMQP / management / MQTT | 5682 / 15682 / 1893 |

Les autres services n'exposent aucun port sur l'hôte. Tous les ports sont configurables via `.env`.

### Démarrage

- `docker compose up` lance l'infra, les services et les simulateurs.
- `npm run dev -w web` lance le front.
- Un service `migrate` applique les migrations Prisma ; un script `seed` charge les données de démo (zones, conteneurs, trois comptes).

---

## 10. Tests

| Niveau | Outils | Contenu minimal |
|---|---|---|
| Unitaires | Vitest | Règles d'empilement, compactage, annulation, règle douane, rattachement auto des tâches ; traduction XML CargoWise dans les deux sens (fixtures) ; hystérésis des alertes ; validation des contrats |
| Intégration (par service) | Vitest + Testcontainers (Postgres, RabbitMQ réels) | Outbox → publication ; publication différée si broker arrêté ; inbox : double livraison = un seul effet ; retry puis parking après 5 échecs ; `VERSION_CONFLICT` ; placements concurrents sur un même emplacement (un seul succès) ; envoi CargoWise ordonné par conteneur, blocage après `FAILED` |
| Contrats | Vitest | Chaque événement et commande produit est validé par son schéma ; chaque consommateur est testé avec les fixtures partagées de `packages/contracts` |
| Bout en bout | Playwright + Docker Compose | (1) pré-avis → arrivée depuis l'interface → gate-in reçu par le simulateur ; (2) ordre de sortie → tâche → exécution → confirmation reçue ; (3) départ refusé si `HOLD` ; (4) capteur hors plage → alerte visible sans action ; (5) deux navigateurs : un déplacement dans l'un apparaît dans l'autre en moins de 2 s |
| Panne | Scripts + Docker Compose | Arrêt de RabbitMQ → déplacement → redémarrage → mouvement reçu par CargoWise ; arrêt de `cargowise-sim` → messages en attente puis envoyés ; arrêt de `telemetry-service` → relevés rattrapés au redémarrage |

---

## 11. Phases d'implémentation

| Phase | Contenu | Critère de fin |
|---|---|---|
| **1. Socle** | Monorepo et déplacement du front dans `web/` ; infra Compose ; `packages/*` ; auth-service ; gateway (routage, ticket WS, diffusion) ; yard-service (Postgres, outbox, inbox, verrouillage optimiste, règles portées) ; front : temps réel § 7.4 et `expectedVersion` ; suppression de `backend/` | L'app fait tout ce qu'elle fait aujourd'hui sur Postgres ; chaque action produit un événement visible dans RabbitMQ ; tests unitaires et d'intégration de la phase verts |
| **2. CargoWise** | cargowise-service + cargowise-sim ; flux sortant et entrant ; pré-avis, ordres, statut douane dans yard-service ; front : attendus, Tâches, journal d'intégration | Scénarios E2E 1, 2 et 3 verts |
| **3. IoT** | Plugin MQTT ; sensor-sim ; telemetry-service ; `ReeferState` alimenté par la télémétrie ; front : « donnée ancienne », courbe d'historique | Scénario E2E 4 vert |
| **4. Durcissement** | Tests de panne, métriques complètes, scénario E2E 5, guide d'exploitation (`docs/runbook.md`) | Tous les tests E2E et de panne verts |

---

## 12. Points ouverts (sans impact sur le démarrage)

- Codes d'événements CargoWise et structure XML exacte : à fixer avec l'accès eAdaptor ; isolés dans `services/cargowise/src/mapping/`.
- Hébergement cible et stratégie de sauvegarde Postgres / RabbitMQ.
- Provisionnement des identifiants des vrais capteurs (un utilisateur MQTT par capteur ou par passerelle).
