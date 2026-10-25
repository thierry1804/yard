# CCIS Yard View - Backlog Detaille et Chiffre (Version Assistee IA)

**Projet :** CCIS Yard View - Application de gestion de parc a conteneurs  
**Client :** CEVA Logistics - Depot Toamasina  
**Date :** 03/04/2026  
**Version :** 1.0 - Avec assistance IA (Claude / Cursor)  
**Base de chiffrage :** 1 tache simple = 2h | 1 jour homme (JH) = 8h

---

## Hypotheses sur le gain IA

| Type de tache | Gain estime | Justification |
|---|---|---|
| Boilerplate / CRUD / code repetitif | 50-60% | Generation automatique, scaffolding, autocompletion avancee |
| Composants UI / CSS | 35-45% | Generation de composants, styles, responsive design |
| Logique metier complexe | 20-30% | L'IA assiste mais le dev doit valider la logique |
| Architecture / conception | 15-20% | Aide a la reflexion mais decisions humaines requises |
| Integration systemes externes | 10-20% | Depend des API tierces, contraintes non controlables |
| Tests (unitaires, E2E) | 45-55% | Generation massive de cas de test, mocks, fixtures |
| Debug / stabilisation | 30-40% | Diagnostic accelere, suggestions de correctifs |
| Documentation technique | 50-60% | Redaction, Swagger, commentaires generes par IA |
| Documentation utilisateur | 40-50% | Redaction assistee, mais validation metier humaine |
| Gestion de projet / coordination | 5-10% | Essentiellement humain |
| UX/UI Design | 10-15% | Outils IA emergents mais validation design humaine |

**Gain moyen global estime : ~35%**

---

## Synthese globale comparative

| Categorie | Sans IA (JH) | Avec IA (JH) | Gain (JH) | Gain (%) |
|---|---|---|---|---|
| Developpement (Frontend + Backend) | 105.5 | 66.5 | 39.0 | 37% |
| Charges complementaires (hors dev) | 54 | 43 | 11.0 | 20% |
| **TOTAL PROJET** | **159.5** | **109.5** | **50.0** | **31%** |

---

## EPIC 1 - Infrastructure & Setup Technique

| ID | User Story / Tache | Complexite | Sans IA (h) | Avec IA (h) | JH IA | Gain |
|---|---|---|---|---|---|---|
| E1-01 | Initialisation projet (repo Git, CI/CD pipeline, environnements dev/staging/prod) | Moyenne | 8 | 5 | 0.625 | 38% |
| E1-02 | Setup framework frontend (React + Vite + TypeScript migration) | Simple | 4 | 2 | 0.25 | 50% |
| E1-03 | Mise en place du Design System (tokens CSS, composants de base, theme sombre) | Moyenne | 12 | 7 | 0.875 | 42% |
| E1-04 | Architecture backend (choix framework, structure projet, configuration) | Moyenne | 8 | 6 | 0.75 | 25% |
| E1-05 | Conception et implementation du schema de base de donnees | Complexe | 16 | 10 | 1.25 | 38% |
| E1-06 | Mise en place authentification et gestion des roles (JWT, RBAC) | Complexe | 20 | 12 | 1.5 | 40% |
| E1-07 | Configuration Docker / conteneurisation | Moyenne | 8 | 4 | 0.5 | 50% |
| **Sous-total Epic 1** | | | **76** | **46** | **5.75** | **39%** |

---

## EPIC 2 - Grille du Yard & Visualisation

| ID | User Story / Tache | Complexite | Sans IA (h) | Avec IA (h) | JH IA | Gain |
|---|---|---|---|---|---|---|
| E2-01 | Grille multi-zones (A/B/C/R) avec Bay x Row | Complexe | 16 | 10 | 1.25 | 38% |
| E2-02 | Affichage conteneur sommet de pile (taille, type, indicateur reefer) | Moyenne | 12 | 7 | 0.875 | 42% |
| E2-03 | Indicateurs de pile (1-3 niveaux) par cellule | Moyenne | 8 | 4 | 0.5 | 50% |
| E2-04 | Filtrage par zone (onglets All / Zone A / B / C / R) | Simple | 4 | 2 | 0.25 | 50% |
| E2-05 | Labels de position (Bay01-R01) sur la grille | Simple | 4 | 2 | 0.25 | 50% |
| E2-06 | Tooltip au survol avec detail de la pile | Moyenne | 8 | 4 | 0.5 | 50% |
| E2-07 | Responsive design et adaptation multi-ecrans | Complexe | 16 | 10 | 1.25 | 38% |
| **Sous-total Epic 2** | | | **68** | **39** | **4.875** | **43%** |

---

## EPIC 3 - Drag & Drop de Conteneurs

| ID | User Story / Tache | Complexite | Sans IA (h) | Avec IA (h) | JH IA | Gain |
|---|---|---|---|---|---|---|
| E3-01 | Deplacement conteneur par glisser-deposer entre cellules | Complexe | 20 | 14 | 1.75 | 30% |
| E3-02 | Validation regles empilage (max 3 niveaux, 40' pas sur 20') | Moyenne | 12 | 7 | 0.875 | 42% |
| E3-03 | Feedback visuel (ghost cursor, surbrillance valide/invalide) | Moyenne | 12 | 7 | 0.875 | 42% |
| E3-04 | Animation de confirmation et MAJ grille apres deplacement | Simple | 6 | 3 | 0.375 | 50% |
| E3-05 | Contrainte : seul conteneur sommet de pile deplacable | Simple | 4 | 2 | 0.25 | 50% |
| **Sous-total Epic 3** | | | **54** | **33** | **4.125** | **39%** |

---

## EPIC 4 - Gestion des Conteneurs

| ID | User Story / Tache | Complexite | Sans IA (h) | Avec IA (h) | JH IA | Gain |
|---|---|---|---|---|---|---|
| E4-01 | API CRUD conteneurs (creation, lecture, MAJ, suppression) | Complexe | 16 | 8 | 1.0 | 50% |
| E4-02 | Panneau detail conteneur (ID, type, ISO, position, client, poids, dates, accessibilite) | Moyenne | 12 | 6 | 0.75 | 50% |
| E4-03 | Vue en elevation de la pile (clic droit popup) | Moyenne | 12 | 7 | 0.875 | 42% |
| E4-04 | Recherche conteneur par ID (temps reel, min 3 caracteres) | Moyenne | 10 | 5 | 0.625 | 50% |
| E4-05 | Filtrage par type (6 types) avec compteurs | Moyenne | 8 | 4 | 0.5 | 50% |
| E4-06 | Gestion des 6 types de conteneurs avec codes ISO 6346 | Simple | 4 | 2 | 0.25 | 50% |
| **Sous-total Epic 4** | | | **62** | **32** | **4.0** | **48%** |

---

## EPIC 5 - Gestionnaire de Mouvements

| ID | User Story / Tache | Complexite | Sans IA (h) | Avec IA (h) | JH IA | Gain |
|---|---|---|---|---|---|---|
| E5-01 | Workflow arrivee conteneur (ID auto/manuel, type, client, poids, zone, placement) | Complexe | 20 | 12 | 1.5 | 40% |
| E5-02 | Workflow depart conteneur (recherche, validation accessibilite, confirmation) | Moyenne | 12 | 7 | 0.875 | 42% |
| E5-03 | Transfert conteneur entre zones (recherche, zone cible, auto-placement) | Complexe | 16 | 10 | 1.25 | 38% |
| E5-04 | Journal des mouvements (arrivee/depart/transfert avec horodatage) | Moyenne | 12 | 6 | 0.75 | 50% |
| E5-05 | Algorithme auto-placement (regles empilage + capacite) | Complexe | 16 | 10 | 1.25 | 38% |
| **Sous-total Epic 5** | | | **76** | **45** | **5.625** | **41%** |

---

## EPIC 6 - Gestion des Zones

| ID | User Story / Tache | Complexite | Sans IA (h) | Avec IA (h) | JH IA | Gain |
|---|---|---|---|---|---|---|
| E6-01 | Creation de zone (ID, label, dimensions lignes x colonnes) | Moyenne | 12 | 6 | 0.75 | 50% |
| E6-02 | Modification de zone (label, dimensions avec validation anti-perte) | Complexe | 16 | 10 | 1.25 | 38% |
| E6-03 | Suppression de zone (uniquement si vide, confirmation) | Simple | 6 | 3 | 0.375 | 50% |
| E6-04 | Liste des zones avec capacite et taux occupation | Simple | 6 | 3 | 0.375 | 50% |
| E6-05 | Algorithme compaction de zone (reorganisation par taille et date sortie) | Complexe | 20 | 14 | 1.75 | 30% |
| E6-06 | Compaction globale (toutes les zones) | Moyenne | 8 | 4 | 0.5 | 50% |
| **Sous-total Epic 6** | | | **68** | **40** | **5.0** | **41%** |

---

## EPIC 7 - Monitoring Reefer

| ID | User Story / Tache | Complexite | Sans IA (h) | Avec IA (h) | JH IA | Gain |
|---|---|---|---|---|---|---|
| E7-01 | Tableau de bord reefer (total, alertes temperature, power off) | Moyenne | 10 | 5 | 0.625 | 50% |
| E7-02 | Filtrage reefers (tous / alertes / power off) | Simple | 6 | 3 | 0.375 | 50% |
| E7-03 | Carte detaillee reefer (commodity, temperatures, power, ventilation, humidite) | Complexe | 16 | 9 | 1.125 | 44% |
| E7-04 | Gestion 8 types commodites avec plages temperature | Moyenne | 8 | 4 | 0.5 | 50% |
| E7-05 | Systeme alertes temperature (detection hors plage, indicateurs visuels) | Complexe | 16 | 10 | 1.25 | 38% |
| E7-06 | Integration IoT / capteurs pour temperature temps reel | Complexe | 24 | 20 | 2.5 | 17% |
| **Sous-total Epic 7** | | | **80** | **51** | **6.375** | **36%** |

---

## EPIC 8 - Dashboard & Analytique

| ID | User Story / Tache | Complexite | Sans IA (h) | Avec IA (h) | JH IA | Gain |
|---|---|---|---|---|---|---|
| E8-01 | KPI principaux (total conteneurs, occupation, reefers, alertes) | Moyenne | 8 | 4 | 0.5 | 50% |
| E8-02 | Graphique occupation par zone (bar chart) | Moyenne | 10 | 5 | 0.625 | 50% |
| E8-03 | Distribution par type de conteneur (doughnut chart) | Moyenne | 8 | 4 | 0.5 | 50% |
| E8-04 | Analyse temps de sejour / dwell time (histogram) | Moyenne | 12 | 6 | 0.75 | 50% |
| E8-05 | Tableau detaille par zone (conteneurs, capacite, occupation) | Simple | 6 | 3 | 0.375 | 50% |
| E8-06 | Export donnees analytiques (CSV / PDF) | Moyenne | 12 | 6 | 0.75 | 50% |
| **Sous-total Epic 8** | | | **56** | **28** | **3.5** | **50%** |

---

## EPIC 9 - Historique & Undo

| ID | User Story / Tache | Complexite | Sans IA (h) | Avec IA (h) | JH IA | Gain |
|---|---|---|---|---|---|---|
| E9-01 | Historique des 20 derniers deplacements (source, destination, horodatage) | Moyenne | 10 | 5 | 0.625 | 50% |
| E9-02 | Annulation deplacement (validation faisabilite, restitution) | Complexe | 16 | 10 | 1.25 | 38% |
| E9-03 | Persistance historique en BDD avec audit trail | Moyenne | 12 | 6 | 0.75 | 50% |
| **Sous-total Epic 9** | | | **38** | **21** | **2.625** | **45%** |

---

## EPIC 10 - Notifications & UX

| ID | User Story / Tache | Complexite | Sans IA (h) | Avec IA (h) | JH IA | Gain |
|---|---|---|---|---|---|---|
| E10-01 | Systeme notifications toast (succes, erreur, info) avec auto-dismiss | Simple | 6 | 3 | 0.375 | 50% |
| E10-02 | Raccourcis clavier (Escape fermeture modales, navigation) | Simple | 4 | 2 | 0.25 | 50% |
| E10-03 | Horloge temps reel et badge statut live | Simple | 4 | 2 | 0.25 | 50% |
| E10-04 | Systeme modales reutilisable (overlay, fermeture externe) | Moyenne | 8 | 4 | 0.5 | 50% |
| **Sous-total Epic 10** | | | **22** | **11** | **1.375** | **50%** |

---

## EPIC 11 - Integration Backend & Temps Reel

| ID | User Story / Tache | Complexite | Sans IA (h) | Avec IA (h) | JH IA | Gain |
|---|---|---|---|---|---|---|
| E11-01 | API REST complete (conteneurs, zones, mouvements, reefers, dashboard) | Complexe | 32 | 16 | 2.0 | 50% |
| E11-02 | WebSocket pour MAJ temps reel (mouvements, alertes reefer) | Complexe | 20 | 14 | 1.75 | 30% |
| E11-03 | Integration CargoWise (synchronisation donnees conteneurs) | Tres complexe | 32 | 26 | 3.25 | 19% |
| E11-04 | Gestion conflits multi-utilisateurs (optimistic locking) | Complexe | 16 | 10 | 1.25 | 38% |
| E11-05 | Cache et optimisation performances (pagination, lazy loading) | Moyenne | 12 | 7 | 0.875 | 42% |
| **Sous-total Epic 11** | | | **112** | **73** | **9.125** | **35%** |

---

## EPIC 12 - Tests & Qualite

| ID | User Story / Tache | Complexite | Sans IA (h) | Avec IA (h) | JH IA | Gain |
|---|---|---|---|---|---|---|
| E12-01 | Tests unitaires frontend (composants React, hooks, rules) | Complexe | 32 | 16 | 2.0 | 50% |
| E12-02 | Tests unitaires backend (API, services, validations) | Complexe | 24 | 12 | 1.5 | 50% |
| E12-03 | Tests integration (frontend-backend, API, BDD) | Complexe | 20 | 12 | 1.5 | 40% |
| E12-04 | Tests end-to-end (scenarios utilisateur avec Playwright/Cypress) | Complexe | 24 | 14 | 1.75 | 42% |
| E12-05 | Tests de performance et charge | Moyenne | 12 | 8 | 1.0 | 33% |
| E12-06 | Correction bugs et stabilisation | Moyenne | 16 | 10 | 1.25 | 38% |
| **Sous-total Epic 12** | | | **128** | **72** | **9.0** | **44%** |

---

## Recapitulatif par Epic (comparatif)

| Epic | Intitule | Sans IA (JH) | Avec IA (JH) | Gain (JH) | Gain (%) |
|---|---|---|---|---|---|
| E1 | Infrastructure & Setup Technique | 9.5 | 5.75 | 3.75 | 39% |
| E2 | Grille du Yard & Visualisation | 8.5 | 4.875 | 3.625 | 43% |
| E3 | Drag & Drop de Conteneurs | 6.75 | 4.125 | 2.625 | 39% |
| E4 | Gestion des Conteneurs | 7.75 | 4.0 | 3.75 | 48% |
| E5 | Gestionnaire de Mouvements | 9.5 | 5.625 | 3.875 | 41% |
| E6 | Gestion des Zones | 8.5 | 5.0 | 3.5 | 41% |
| E7 | Monitoring Reefer | 10.0 | 6.375 | 3.625 | 36% |
| E8 | Dashboard & Analytique | 7.0 | 3.5 | 3.5 | 50% |
| E9 | Historique & Undo | 4.75 | 2.625 | 2.125 | 45% |
| E10 | Notifications & UX | 2.75 | 1.375 | 1.375 | 50% |
| E11 | Integration Backend & Temps Reel | 14.0 | 9.125 | 4.875 | 35% |
| E12 | Tests & Qualite | 16.0 | 9.0 | 7.0 | 44% |
| **TOTAL DEV** | | **105.5** | **61.375** | **44.125** | **42%** |

---

## Charges Complementaires (comparatif)

| ID | Activite | Sans IA (JH) | Avec IA (JH) | Gain | Justification IA |
|---|---|---|---|---|---|
| CC-01 | Gestion de projet | 12 | 11 | 8% | Reporting assiste, mais pilotage reste humain |
| CC-02 | Specifications fonctionnelles | 6 | 4 | 33% | Redaction user stories assistee par IA |
| CC-03 | Specifications techniques | 4 | 2.5 | 38% | Generation diagrammes et specs assistee |
| CC-04 | UX/UI Design | 8 | 7 | 13% | Outils IA emergents, validation humaine requise |
| CC-05 | Recette / QA | 6 | 4.5 | 25% | Scenarios de test generes par IA, execution humaine |
| CC-06 | Documentation technique | 3 | 1.5 | 50% | Generation Swagger, commentaires, README par IA |
| CC-07 | Documentation utilisateur | 3 | 2 | 33% | Redaction assistee, validation metier humaine |
| CC-08 | Formation utilisateurs | 2 | 2 | 0% | 100% humain - interaction directe |
| CC-09 | Deploiement & DevOps | 5 | 3.5 | 30% | Scripts IaC generes, config assistee |
| CC-10 | Support post-livraison | 5 | 4 | 20% | Diagnostic assiste, resolution plus rapide |
| **TOTAL** | | **54** | **42** | **22%** | |

---

## Macro Planning (version IA)

**Duree d'un sprint : 2 semaines**  
**Equipe estimee : 2 developpeurs assistes IA + 1 chef de projet (partiel)**

| Sprint | Periode | Epics | Charge (JH) | Jalon |
|---|---|---|---|---|
| Sprint 0 | S1-S2 | Specs fonctionnelles, UX/UI Design | 13.5 | **J1 : Cadrage valide** |
| Sprint 1 | S3-S4 | E1 (Infrastructure) + E2 (Grille Yard) + E10 (UX) | 12.0 | **J2 : Environnement pret** |
| Sprint 2 | S5-S6 | E3 (Drag & Drop) + E4 (Conteneurs) + E9 (Historique) | 10.75 | |
| Sprint 3 | S7-S8 | E5 (Mouvements) + E6 (Zones) | 10.625 | **J3 : MVP Core** |
| Sprint 4 | S9-S10 | E7 (Reefer) + E8 (Dashboard) | 9.875 | **J4 : Features completes** |
| Sprint 5 | S11-S12 | E11 (Backend & Integration) | 9.125 | **J5 : Backend integre** |
| Sprint 6 | S13-S14 | E12 (Tests & Qualite) + Recette | 13.5 | **J6 : Mise en production** |

**Duree totale estimee : 14 semaines (~3.5 mois)**  
**Gain planning : 6 semaines (-30%) par rapport a la version sans IA**
