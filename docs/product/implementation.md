# Évolution métier CCIS Yard View

Périmètre autorisé le 25 octobre 2026 : inventaire et exports, sorties prévues et blocages, tâches terrain, réorganisation proposée, audit paginé, contrôle physique, gate et rendez-vous, inspections, alertes reefer, imports contrôlés et échanges.

Les positions représentent le réalisé. Une tâche demandée ne change pas la position. La confirmation utilise les règles et versions actuelles ; un conflit interdit la confirmation.

Les dimensions physiques d'une case restent à valider avec le dépôt. L'occupation exprime des positions de stockage, pas des TEU. Les paramètres de zone sont configurables.

CargoWise et EDI : aucun accès ni exemple disponible. Préparer l'import JSON/CSV interne et le journal, sans prétendre à une connexion active ni à une conformité à un message EDI externe.

Données existantes et changements non commités conservés. Migrations additives uniquement.

## Livré localement

- Inventaire, sorties prévues, vues enregistrées et exports CSV.
- Tâches terrain, affectation et confirmation transactionnelle ; listes paginées.
- Propositions de rangement avec validation administrateur et tâches ordonnées.
- Blocages de sortie et paramètres de stockage par zone.
- Passages camion, reçus imprimables et rendez-vous à capacité contrôlée.
- Inspections avec photos, devis et autorisation de réparation.
- Contrôles physiques, écarts et corrections administrateur tracées.
- Prises en charge d'alertes reefer et relevés manuels.
- Journal paginé, audit métier et import JSON/CSV interne transactionnel.
- Indicateurs de tâches, sorties et temps de passage camion.

## Dépendances externes restantes

Accès CargoWise/EDI, source des capteurs et relevé physique du parc. Aucun connecteur externe actif, aucun échange EDI certifié, aucun dimensionnement physique supposé. Les portails externes et la facturation restent des extensions distinctes à définir avec les systèmes existants.

Guide d'utilisation : `operations-guide.md`.
