# Opérations du dépôt

Accès : bouton **Opérations** en haut du plan.

## Inventaire et sorties

La liste complète du stock peut être recherchée par numéro ou client, filtrée par zone, client et disponibilité, triée par date de sortie ou ancienneté. Export CSV et enregistrement d'une vue sur le navigateur. « Localiser » ouvre la fiche et la position réelle.

Les sorties prévues identifient les conteneurs à dégager. Les blocages douaniers, client et les ordres obligatoires sont contrôlés côté serveur lors de la sortie physique. Un administrateur renseigne les autorisations et la date prévue depuis « Autorisations ».

## Tâches terrain

Glisser un conteneur, demander une sortie ou un transfert crée une tâche, sans modifier sa position physique.

1. Demander la tâche.
2. Affecter un opérateur et, si connu, un engin.
3. Démarrer l'exécution.
4. Confirmer que l'opération a réellement été effectuée.

Un opérateur peut prendre une tâche pour lui-même ; seul un administrateur peut l'affecter à quelqu'un d'autre. Les tâches bloquées ou annulées exigent un motif. Une seule tâche active est permise par conteneur. Les listes sont paginées et séparent l'actif de l'historique.

La confirmation vérifie la version source, l'accessibilité du sommet, la destination et les règles actuelles. Après une modification concurrente de la source, annuler la demande périmée et créer une nouvelle tâche après vérification du terrain.

Les indicateurs montrent les tâches actives/en retard, les confirmations sur 24 h et le temps moyen des passages camion terminés sur cette période. La productivité par engin compte les tâches confirmées, pas des mouvements mesurés par télémétrie.

« Demander retour » depuis l'ancien historique crée une nouvelle tâche inverse ; l'historique initial reste conservé.

## Réorganisation

« Réorganiser le parc » ouvre le module de proposition. Aucun emplacement ne change au calcul ni à la validation.

L'algorithme propose des déplacements du sommet vers des cases antérieures compatibles, avec préférence pour les départs proches. Il ne prétend pas calculer un optimum global. Il ne construit pas de déplacements temporaires via des cases tampon : certains réarrangements restent à planifier manuellement.

Un administrateur valide la proposition revue et crée les tâches. Les tâches d'un même plan s'exécutent dans leur ordre. Une modification du parc ou des règles entre le calcul et la validation invalide la proposition. Les anciens endpoints de compactage immédiat sont désactivés.

## Passages camion et rendez-vous

Enregistrer le camion, le transporteur, le chauffeur et la référence documentaire. États : arrivé, contrôlé ou bloqué, puis sorti. Un conteneur peut être lié au contrôle si son arrivée a été enregistrée entre-temps.

Un enlèvement exige l'identification et l'autorisation du conteneur. La sortie camion exige que la sortie physique du conteneur ait déjà été confirmée. Pour une dépose, l'arrivée doit avoir été enregistrée. Le reçu imprimable retrace le passage et son temps ; il ne constitue pas un document réglementaire certifié.

Les rendez-vous portent une plage horaire en heure de Toamasina. Le serveur refuse les créneaux au-delà de la capacité configurée (4 simultanés par défaut). Ils peuvent être marqués arrivés, terminés ou annulés. Les rendez-vous et les passages sont des enregistrements distincts reliés par leur référence opérationnelle.

## Inspections et réparations

Constat à l'entrée, à la sortie ou à l'atelier ; état, note, jusqu'à deux photos JPG/PNG/WebP de 250 Ko, estimation et référence d'ordre de travail. Parcours : ouvert, devis établi, autorisé/refusé, réparé, clôturé. L'autorisation de réparation est réservée à l'administrateur. Les traitements sont conservés dans l'audit.

## Contrôle physique

Relever le numéro et la position observés, y compris un conteneur inconnu du système. La position attendue et sa version sont conservées lors du constat. Marquer le constat conforme ou signaler un écart.

L'administrateur peut corriger la position enregistrée d'un conteneur présent après vérification physique. La correction est distincte d'une manutention dans le journal. Les contraintes d'empilage et les conflits restent vérifiés ; une pile incohérente ou un conteneur absent exige une investigation, sans sortie fictive automatique. Un constat d'un conteneur inconnu ne crée pas automatiquement une arrivée.

## Reefers

Surveiller température, alimentation et âge du relevé. Les relevés de plus d'une heure sont signalés comme anciens. Un relevé manuel et un acquittement d'alerte sont des actions distinctes. L'acquittement garde la mesure et l'état au moment de l'intervention et ne masque pas une condition encore active. Les connexions à des capteurs ne sont pas configurées.

## Journal et audit

Journal des mouvements physiques paginé, filtrable par conteneur, zone, type, auteur et période ; export de la page. L'audit métier réservé aux administrateurs conserve les demandes, validations, changements et corrections avec auteur et données avant/après.

## Règles de stockage

Par zone : hauteur 1–3 niveaux, types autorisés, poids maximum par conteneur, réservation reefer, nombre de prises et cases condamnées. Une configuration incompatible avec le stock présent est refusée.

Les valeurs initiales conservent les conventions du prototype : trois niveaux, types non limités, pas de limite de poids ni de prises. Elles doivent être renseignées avec le dépôt. Une case reste une position logique et l'occupation n'est pas exprimée en TEU. La géométrie physique 20'/40', les voies de circulation et les contraintes propres aux engins nécessitent un relevé du site avant mise en production.

## Échanges

Imports JSON et CSV internes, prévisualisation puis validation administrateur. 200 arrivées maximum par fichier ; contrôle serveur et transaction globale à l'application : aucune création partielle en cas d'échec. Les échecs d'application sont tracés dans l'audit. Un import appliqué ne peut pas être rejoué.

Un modèle CSV est disponible. Les en-têtes sont `containerNo,type,zoneId,client,weightKg,plannedExitDate` ; les trois premiers sont obligatoires. Les types correspondent aux valeurs du modèle fourni. Les dates CSV peuvent être au format AAAA-MM-JJ.

CargoWise et EDI sont **non configurés** : aucun appel externe, synchronisation fictive ou message EDI revendiqué. Il faut les accès de test, les formats et la décision sur le système faisant autorité pour chaque donnée avant de développer les connecteurs spécifiques. Les portails externes et la facturation ne sont pas activés par ces modules internes.

## Déploiement et validation

Migration additive `20261025160000_operations` ; stock et historique existants conservés. Sauvegarde locale préalable : `/tmp/ccis-yard-before-operations.dump` (fichier privé, emplacement temporaire).

Le service yard applique les migrations à son démarrage. Redémarrer aussi la passerelle pour prendre en compte les routes et contrats d'événements supplémentaires. Le nouveau module frontend est chargé à la demande.

Les tests métier utilisent une base PostgreSQL isolée via Testcontainers ; ils ne modifient pas le stock de l'instance locale. Les relevés, autorisations et tâches de l'environnement réel restent à renseigner par les équipes du dépôt.
