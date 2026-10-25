# CCIS Yard View - Backlog Detaille et Chiffre

**Projet :** CCIS Yard View - Application de gestion de parc a conteneurs  
**Client :** CEVA Logistics - Depot Toamasina  
**Date :** 03/04/2026  
**Version :** 1.0  
**Base de chiffrage :** 1 tache simple = 2h | 1 jour homme (JH) = 8h

---

## Synthese globale

| Categorie | Charge (JH) |
|---|---|
| Developpement (Frontend + Backend) | 105.5 |
| Charges complementaires (hors dev) | 51 |
| **TOTAL PROJET** | **156.5** |

---

## EPIC 1 - Infrastructure & Setup Technique

| ID | User Story / Tache | Complexite | Heures | JH |
|---|---|---|---|---|
| E1-01 | Initialisation projet (repo Git, CI/CD pipeline, environnements dev/staging/prod) | Moyenne | 8 | 1.0 |
| E1-02 | Setup framework frontend (React + Vite + TypeScript migration) | Simple | 4 | 0.5 |
| E1-03 | Mise en place du Design System (tokens CSS, composants de base, theme sombre) | Moyenne | 12 | 1.5 |
| E1-04 | Architecture backend (choix framework, structure projet, configuration) | Moyenne | 8 | 1.0 |
| E1-05 | Conception et implementation du schema de base de donnees | Complexe | 16 | 2.0 |
| E1-06 | Mise en place de l'authentification et gestion des roles (JWT, RBAC) | Complexe | 20 | 2.5 |
| E1-07 | Configuration Docker / conteneurisation | Moyenne | 8 | 1.0 |
| **Sous-total Epic 1** | | | **76** | **9.5** |

---

## EPIC 2 - Grille du Yard & Visualisation

| ID | User Story / Tache | Complexite | Heures | JH |
|---|---|---|---|---|
| E2-01 | En tant qu'operateur, je veux voir une grille multi-zones (A/B/C/R) avec Bay x Row | Complexe | 16 | 2.0 |
| E2-02 | En tant qu'operateur, je veux voir le conteneur du sommet de pile dans chaque cellule (taille, type, indicateur reefer) | Moyenne | 12 | 1.5 |
| E2-03 | En tant qu'operateur, je veux voir les indicateurs de pile (1-3 niveaux) par cellule | Moyenne | 8 | 1.0 |
| E2-04 | En tant qu'operateur, je veux filtrer la vue par zone (onglets All / Zone A / B / C / R) | Simple | 4 | 0.5 |
| E2-05 | En tant qu'operateur, je veux voir les labels de position (Bay01-R01) sur la grille | Simple | 4 | 0.5 |
| E2-06 | En tant qu'operateur, je veux un tooltip au survol montrant le detail de la pile | Moyenne | 8 | 1.0 |
| E2-07 | Responsive design et adaptation multi-ecrans (desktop, tablette terrain) | Complexe | 16 | 2.0 |
| **Sous-total Epic 2** | | | **68** | **8.5** |

---

## EPIC 3 - Drag & Drop de Conteneurs

| ID | User Story / Tache | Complexite | Heures | JH |
|---|---|---|---|---|
| E3-01 | En tant qu'operateur, je veux deplacer un conteneur par glisser-deposer entre cellules | Complexe | 20 | 2.5 |
| E3-02 | Validation des regles d'empilage (max 3 niveaux, 40' ne peut pas aller sur 20') | Moyenne | 12 | 1.5 |
| E3-03 | Feedback visuel pendant le drag (ghost cursor, surbrillance valide/invalide) | Moyenne | 12 | 1.5 |
| E3-04 | Animation de confirmation et mise a jour de la grille apres deplacement | Simple | 6 | 0.75 |
| E3-05 | Contrainte : seul le conteneur du sommet de pile peut etre deplace | Simple | 4 | 0.5 |
| **Sous-total Epic 3** | | | **54** | **6.75** |

---

## EPIC 4 - Gestion des Conteneurs

| ID | User Story / Tache | Complexite | Heures | JH |
|---|---|---|---|---|
| E4-01 | API CRUD conteneurs (creation, lecture, mise a jour, suppression) | Complexe | 16 | 2.0 |
| E4-02 | En tant qu'operateur, je veux voir le detail complet d'un conteneur (panneau lateral) : ID, type, ISO, position, client, poids, dates, accessibilite | Moyenne | 12 | 1.5 |
| E4-03 | En tant qu'operateur, je veux voir la pile en elevation (clic droit) avec tous les niveaux | Moyenne | 12 | 1.5 |
| E4-04 | En tant qu'operateur, je veux rechercher un conteneur par ID (recherche temps reel, min 3 car.) | Moyenne | 10 | 1.25 |
| E4-05 | En tant qu'operateur, je veux filtrer les conteneurs par type (6 types : empty-20/40, full-20/40, reefer, reefer-full) avec compteurs | Moyenne | 8 | 1.0 |
| E4-06 | Gestion des 6 types de conteneurs avec codes ISO 6346 | Simple | 4 | 0.5 |
| **Sous-total Epic 4** | | | **62** | **7.75** |

---

## EPIC 5 - Gestionnaire de Mouvements

| ID | User Story / Tache | Complexite | Heures | JH |
|---|---|---|---|---|
| E5-01 | En tant qu'operateur, je veux enregistrer l'arrivee d'un conteneur (ID auto/manuel, type, client, poids, zone, positionnement auto/manuel) | Complexe | 20 | 2.5 |
| E5-02 | En tant qu'operateur, je veux enregistrer le depart d'un conteneur (recherche, validation accessibilite, confirmation) | Moyenne | 12 | 1.5 |
| E5-03 | En tant qu'operateur, je veux transferer un conteneur entre zones (recherche, zone cible, auto-placement) | Complexe | 16 | 2.0 |
| E5-04 | En tant qu'operateur, je veux consulter le journal des mouvements (arrivee/depart/transfert avec horodatage) | Moyenne | 12 | 1.5 |
| E5-05 | Algorithme d'auto-placement respectant les regles d'empilage et la capacite | Complexe | 16 | 2.0 |
| **Sous-total Epic 5** | | | **76** | **9.5** |

---

## EPIC 6 - Gestion des Zones

| ID | User Story / Tache | Complexite | Heures | JH |
|---|---|---|---|---|
| E6-01 | En tant qu'administrateur, je veux creer une zone (ID, label, dimensions lignes x colonnes) | Moyenne | 12 | 1.5 |
| E6-02 | En tant qu'administrateur, je veux modifier une zone (label, dimensions avec validation anti-perte de donnees) | Complexe | 16 | 2.0 |
| E6-03 | En tant qu'administrateur, je veux supprimer une zone (uniquement si vide, avec confirmation) | Simple | 6 | 0.75 |
| E6-04 | En tant qu'administrateur, je veux voir la liste des zones avec capacite et taux d'occupation | Simple | 6 | 0.75 |
| E6-05 | Algorithme de compaction de zone (reorganisation intelligente par taille et date de sortie) | Complexe | 20 | 2.5 |
| E6-06 | Compaction globale (toutes les zones) | Moyenne | 8 | 1.0 |
| **Sous-total Epic 6** | | | **68** | **8.5** |

---

## EPIC 7 - Monitoring Reefer

| ID | User Story / Tache | Complexite | Heures | JH |
|---|---|---|---|---|
| E7-01 | En tant qu'operateur, je veux voir le tableau de bord reefer (total, alertes temperature, power off) | Moyenne | 10 | 1.25 |
| E7-02 | En tant qu'operateur, je veux filtrer les reefers (tous / alertes / power off) | Simple | 6 | 0.75 |
| E7-03 | En tant qu'operateur, je veux voir la carte detaillee de chaque reefer (commodity, temperatures, power, ventilation, humidite) | Complexe | 16 | 2.0 |
| E7-04 | Gestion des 8 types de commodites avec plages de temperature | Moyenne | 8 | 1.0 |
| E7-05 | Systeme d'alertes temperature (detection hors plage, indicateurs visuels) | Complexe | 16 | 2.0 |
| E7-06 | Integration IoT / capteurs pour remontee de temperature en temps reel | Complexe | 24 | 3.0 |
| **Sous-total Epic 7** | | | **80** | **10.0** |

---

## EPIC 8 - Dashboard & Analytique

| ID | User Story / Tache | Complexite | Heures | JH |
|---|---|---|---|---|
| E8-01 | En tant que manager, je veux voir les KPI principaux (total conteneurs, occupation, reefers, alertes) | Moyenne | 8 | 1.0 |
| E8-02 | En tant que manager, je veux voir le graphique d'occupation par zone (bar chart) | Moyenne | 10 | 1.25 |
| E8-03 | En tant que manager, je veux voir la distribution par type de conteneur (doughnut chart) | Moyenne | 8 | 1.0 |
| E8-04 | En tant que manager, je veux voir l'analyse du temps de sejour (dwell time histogram) | Moyenne | 12 | 1.5 |
| E8-05 | En tant que manager, je veux voir le tableau detaille par zone (conteneurs, capacite, occupation) | Simple | 6 | 0.75 |
| E8-06 | Export des donnees analytiques (CSV / PDF) | Moyenne | 12 | 1.5 |
| **Sous-total Epic 8** | | | **56** | **7.0** |

---

## EPIC 9 - Historique & Undo

| ID | User Story / Tache | Complexite | Heures | JH |
|---|---|---|---|---|
| E9-01 | En tant qu'operateur, je veux voir l'historique des 20 derniers deplacements (source, destination, horodatage) | Moyenne | 10 | 1.25 |
| E9-02 | En tant qu'operateur, je veux annuler un deplacement (validation de faisabilite, restitution) | Complexe | 16 | 2.0 |
| E9-03 | Persistance de l'historique en base de donnees avec audit trail | Moyenne | 12 | 1.5 |
| **Sous-total Epic 9** | | | **38** | **4.75** |

---

## EPIC 10 - Notifications & UX

| ID | User Story / Tache | Complexite | Heures | JH |
|---|---|---|---|---|
| E10-01 | Systeme de notifications toast (succes, erreur, info) avec auto-dismiss | Simple | 6 | 0.75 |
| E10-02 | Raccourcis clavier (Escape fermeture modales, navigation) | Simple | 4 | 0.5 |
| E10-03 | Horloge temps reel et badge de statut live | Simple | 4 | 0.5 |
| E10-04 | Systeme de modales reutilisable (overlay, fermeture externe) | Moyenne | 8 | 1.0 |
| **Sous-total Epic 10** | | | **22** | **2.75** |

---

## EPIC 11 - Integration Backend & Temps Reel

| ID | User Story / Tache | Complexite | Heures | JH |
|---|---|---|---|---|
| E11-01 | API REST complete (endpoints conteneurs, zones, mouvements, reefers, dashboard) | Complexe | 32 | 4.0 |
| E11-02 | WebSocket pour mises a jour temps reel (mouvements, alertes reefer) | Complexe | 20 | 2.5 |
| E11-03 | Integration CargoWise (synchronisation donnees conteneurs) | Tres complexe | 32 | 4.0 |
| E11-04 | Gestion des conflits multi-utilisateurs (optimistic locking) | Complexe | 16 | 2.0 |
| E11-05 | Cache et optimisation des performances (pagination, lazy loading) | Moyenne | 12 | 1.5 |
| **Sous-total Epic 11** | | | **112** | **14.0** |

---

## EPIC 12 - Tests & Qualite

| ID | User Story / Tache | Complexite | Heures | JH |
|---|---|---|---|---|
| E12-01 | Tests unitaires frontend (composants React, hooks, rules) | Complexe | 32 | 4.0 |
| E12-02 | Tests unitaires backend (API, services, validations) | Complexe | 24 | 3.0 |
| E12-03 | Tests d'integration (frontend-backend, API, base de donnees) | Complexe | 20 | 2.5 |
| E12-04 | Tests end-to-end (scenarios utilisateur complets avec Playwright/Cypress) | Complexe | 24 | 3.0 |
| E12-05 | Tests de performance et charge | Moyenne | 12 | 1.5 |
| E12-06 | Correction de bugs et stabilisation | Moyenne | 16 | 2.0 |
| **Sous-total Epic 12** | | | **128** | **16.0** |

---

## Recapitulatif par Epic

| Epic | Intitule | Charge (JH) |
|---|---|---|
| E1 | Infrastructure & Setup Technique | 9.5 |
| E2 | Grille du Yard & Visualisation | 8.5 |
| E3 | Drag & Drop de Conteneurs | 6.75 |
| E4 | Gestion des Conteneurs | 7.75 |
| E5 | Gestionnaire de Mouvements | 9.5 |
| E6 | Gestion des Zones | 8.5 |
| E7 | Monitoring Reefer | 10.0 |
| E8 | Dashboard & Analytique | 7.0 |
| E9 | Historique & Undo | 4.75 |
| E10 | Notifications & UX | 2.75 |
| E11 | Integration Backend & Temps Reel | 14.0 |
| E12 | Tests & Qualite | 16.0 |
| **TOTAL DEVELOPPEMENT** | | **105.5** |

---

## Charges Complementaires (hors developpement)

| ID | Activite | Charge (JH) |
|---|---|---|
| CC-01 | Gestion de projet (pilotage, suivi, coordination, reporting) | 12 |
| CC-02 | Specifications fonctionnelles detaillees | 6 |
| CC-03 | Specifications techniques | 4 |
| CC-04 | UX/UI Design (maquettes, prototypage, charte graphique) | 8 |
| CC-05 | Recette / QA (campagnes de tests, PV de recette) | 6 |
| CC-06 | Documentation technique (architecture, API, deploiement) | 3 |
| CC-07 | Documentation utilisateur (guide, FAQ) | 3 |
| CC-08 | Formation utilisateurs | 2 |
| CC-09 | Deploiement & DevOps (infra, monitoring, CI/CD production) | 5 |
| CC-10 | Support post-livraison / garantie (1 mois) | 5 |
| **TOTAL CHARGES COMPLEMENTAIRES** | | **54** |

---

## Macro Planning

**Duree d'un sprint : 2 semaines**  
**Equipe estimee : 2 developpeurs + 1 chef de projet (partiel)**

| Sprint | Periode | Epics | Jalon |
|---|---|---|---|
| Sprint 0 | S1-S2 | Specs fonctionnelles, UX/UI Design | **Jalon 1 : Cadrage valide** |
| Sprint 1 | S3-S4 | E1 (Infrastructure & Setup) | **Jalon 2 : Environnement pret** |
| Sprint 2 | S5-S6 | E2 (Grille Yard) + E10 (Notifications/UX) | |
| Sprint 3 | S7-S8 | E3 (Drag & Drop) + E4 (Gestion Conteneurs) | **Jalon 3 : MVP Core** |
| Sprint 4 | S9-S10 | E5 (Mouvements) + E6 (Zones) | |
| Sprint 5 | S11-S12 | E7 (Reefer) + E8 (Dashboard) | **Jalon 4 : Fonctionnalites completes** |
| Sprint 6 | S13-S14 | E11 (Backend & Integration) | |
| Sprint 7 | S15-S16 | E11 (suite) + E9 (Historique) | **Jalon 5 : Integration backend terminee** |
| Sprint 8 | S17-S18 | E12 (Tests & Qualite) | |
| Sprint 9 | S19-S20 | Recette, corrections, deploiement, formation | **Jalon 6 : Mise en production** |

**Duree totale estimee : 20 semaines (5 mois)**
