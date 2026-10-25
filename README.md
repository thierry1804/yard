# CCIS Yard View

Application de visualisation et de gestion des opérations du dépôt (yard) pour **CEVA Logistics — Dépôt Toamasina**. Vue plan du yard avec zones, conteneurs, drag & drop, mouvements et gestion des zones.

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

## Espace Opérations

Le bouton **Opérations** donne accès à l'inventaire avec exports et vues enregistrées, aux sorties prévues et autorisations, aux tâches terrain, aux propositions de réorganisation, aux passages et rendez-vous camions, aux inspections/réparations, aux contrôles physiques, au suivi reefer, au journal/audit, aux imports JSON/CSV et aux règles de stockage.

Les demandes de déplacement ne changent plus les positions physiques : l'opérateur confirme leur exécution dans les tâches terrain. La réorganisation produit des propositions à valider. Les sorties sont contrôlées côté serveur selon les blocages et autorisations.

Voir le [guide des opérations](docs/product/operations-guide.md) pour les parcours, les règles, le déploiement et les limites actuelles. CargoWise, EDI et capteurs ne sont pas configurés.

## Plan du parc et fonctions historiques



### Plan du yard

- **Grille par zones** : zones A (Import), B (Export), C (Transit), R (Reefer) avec rangées et baies.
- **Onglets de zone** : affichage « Tout » ou une zone donnée.
- **Labels** : Bay 01..NN, R01..NN par zone.
- **Piles** : jusqu’à 3 niveaux (tiers) par emplacement ; affichage du conteneur au sommet avec type et ID.

### Drag & drop

- Glisser **uniquement le conteneur du sommet** d’une pile vers un autre emplacement.
- **Ghost** pendant le drag (ID + type).
- **Validation** : pile pleine (3 niveaux) ou règle 40'/20' → message d’erreur en toast.
- **Règle d’empilage** : un 40' ne peut pas être posé sur un 20'.
- Feedback visuel : cellule source « dragging », cibles valides/invalides, cellule « just-moved » après dépôt.

### Recherche et filtres

- **Recherche conteneur** (sidebar) : saisie d’un ID (ex. MSCU1234567) ; les cellules contenant un conteneur correspondant sont **mises en évidence**.
- **Filtres par type** : Tous, Vide 20', Vide 40', Plein 20', Plein 40', Reefer vide, Reefer plein. Comptage par type ; les cellules sans conteneur du type sélectionné sont atténuées (`filtered-out`).

### Statistiques (sidebar)

- Nombre total de conteneurs.
- Taux d’occupation (%).
- Nombre de reefers.
- Nombre de piles avec au moins 2 conteneurs.

### Historique des mouvements (sidebar)

- Liste des derniers déplacements par drag & drop (position d’origine → position cible, heure).
- **Demander retour** : crée une tâche de déplacement inverse, à confirmer sur le terrain selon les règles actuelles.

### Clic droit — Vue pile

- Clic droit sur une cellule non vide ouvre une **popup** avec la pile en **vue en élévation** (T1, T2, T3).
- Chaque conteneur affiche : tier, ID, client, poids, type.
- Clic sur un conteneur → ouverture du **panneau détail** de ce conteneur.

### Panneau détail conteneur

- Ouvert depuis la vue pile ou directement.
- Affiche : ID, type, position (zone, bay, row, tier), hauteur de pile, client, poids, dates d’entrée/sortie, transporteur, « accessible directement » (sommet ou non), mention source (CargoWise / sync auto).
- Fermeture par bouton ou touche **Échap**.

### Gestion des zones (bouton « Zones » dans le header)

- **Liste des zones** : ID, libellé, dimensions, nombre de conteneurs / capacité, barre de progression.
- **Ajout** : identifiant, libellé, nombre de rangées et de baies ; création des emplacements vides.
- **Modification** : changement du libellé et des dimensions ; réduction possible seulement si les emplacements supprimés sont vides.
- **Suppression** : possible uniquement si la zone ne contient aucun conteneur.

### Mouvements (bouton « Mouvements » dans le header)

- **Arrivée** : enregistrement d’un nouveau conteneur (ID optionnel = généré sinon), type, client, poids, zone de destination ; **placement automatique** (premier emplacement libre) ou choix manuel rangée/baie. Respect des règles d’empilage et de la capacité.
- **Départ** : recherche par ID (min. 3 caractères), liste des correspondances ; sortie possible seulement si le conteneur est **au sommet** de sa pile.
- **Transfert** : recherche conteneur + choix de la zone cible ; déplacement vers le premier emplacement libre de la zone cible (conteneur au sommet requis).
- **Journal** : liste des mouvements de la session (arrivées, départs, transferts) avec horodatage et positions.

### Compaction

- **Réorganiser [zone]** ou **Réorganiser le parc** : calcul d’une proposition puis validation administrateur et création de tâches ordonnées. Les positions changent seulement à la confirmation terrain. L’historique reste conservé.

### Notifications (toasts)

- Succès, erreur, info (ex. mouvement effectué, erreur pile pleine, annulation, compaction).
- Disparition automatique après quelques secondes.

### Divers

- **Horloge** (header) : heure courante (EAT).
- **Badge « En direct »** dans le header.
- **Touche Échap** : ferme le panneau détail, la popup pile, le gestionnaire de zones et le gestionnaire de mouvements.
- **Tooltip** au survol d’une cellule (position, nombre de conteneurs, liste des tiers avec ID et type ; rappel « Clic droit → vue pile · Glisser → déplacer le sommet »).

---

## Données et configuration

- **Types de conteneurs** : `empty-20`, `empty-40`, `full-20`, `full-40`, `reefer`, `reefer-full` (définis dans `src/data/config.js`).
- **Zones par défaut** : A (6×10), B (5×10), C (4×10), R (3×8).
- **Génération** : au chargement, `generateYardData()` remplit aléatoirement les zones (piles 0 à 3 conteneurs, types et clients cohérents).
- **Transporteurs / clients** : listes dans `config.js` (ex. MSCU, CMAU, Jovenna, Star, etc.).

---

## Structure du projet

```
src/
  App.jsx              # Point d’entrée, layout, modales
  components/
    Header.jsx         # Logo, titre, boutons Zones / Mouvements, horloge, badge En direct
    Sidebar.jsx        # Recherche, filtres, stats, historique + annulation
    YardGrid.jsx       # Grille des zones, drag & drop, tooltip, clic droit
    YardCell.jsx       # Une cellule (pile), états visuels, drag
    StackPopup.jsx     # Popup vue en élévation (pile)
    DetailPanel.jsx    # Panneau détail d’un conteneur
    ZoneManager.jsx    # Modal gestion des zones (CRUD)
    MovementManager.jsx# Modal mouvements (arrivée, départ, transfert, journal)
    ToastContainer.jsx # Affichage des toasts
  hooks/
    useYardState.js    # État global (stacks, zones, historique, actions)
  data/
    config.js          # MAX_TIER, ZONES, TYPES, CARRIERS, CLIENTS
    generateData.js    # Génération données démo, posLabel
    rules.js           # canStack (40'/20'), getSize, compactZone
```

---

## Scripts

| Commande   | Description              |
|-----------|--------------------------|
| `npm run dev`     | Serveur de développement |
| `npm run build`   | Build de production       |
| `npm run preview` | Prévisualisation du build |
| `npm run lint`    | ESLint                   |
