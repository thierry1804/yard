import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter

wb = openpyxl.Workbook()

# ============================================================
# STYLES
# ============================================================
header_font = Font(name='Calibri', bold=True, size=11, color='FFFFFF')
header_fill = PatternFill(start_color='2F5496', end_color='2F5496', fill_type='solid')
epic_font = Font(name='Calibri', bold=True, size=11, color='FFFFFF')
epic_fill = PatternFill(start_color='4472C4', end_color='4472C4', fill_type='solid')
subtotal_font = Font(name='Calibri', bold=True, size=11)
subtotal_fill = PatternFill(start_color='D6E4F0', end_color='D6E4F0', fill_type='solid')
total_font = Font(name='Calibri', bold=True, size=12, color='FFFFFF')
total_fill = PatternFill(start_color='1F3864', end_color='1F3864', fill_type='solid')
title_font = Font(name='Calibri', bold=True, size=14, color='2F5496')
thin_border = Border(
    left=Side(style='thin'), right=Side(style='thin'),
    top=Side(style='thin'), bottom=Side(style='thin')
)
center = Alignment(horizontal='center', vertical='center', wrap_text=True)
left_wrap = Alignment(horizontal='left', vertical='center', wrap_text=True)

def style_header(ws, row, cols):
    for c in range(1, cols + 1):
        cell = ws.cell(row=row, column=c)
        cell.font = header_font
        cell.fill = header_fill
        cell.alignment = center
        cell.border = thin_border

def style_row(ws, row, cols, font=None, fill=None):
    for c in range(1, cols + 1):
        cell = ws.cell(row=row, column=c)
        cell.border = thin_border
        cell.alignment = center if c != 2 else left_wrap
        if font: cell.font = font
        if fill: cell.fill = fill

# ============================================================
# ONGLET 1 : BACKLOG CHIFFRE
# ============================================================
ws1 = wb.active
ws1.title = "Backlog Chiffre"

# Title
ws1.merge_cells('A1:F1')
ws1['A1'] = 'CCIS Yard View - Backlog Detaille et Chiffre'
ws1['A1'].font = title_font
ws1['A1'].alignment = Alignment(horizontal='center', vertical='center')
ws1.row_dimensions[1].height = 30

ws1.merge_cells('A2:F2')
ws1['A2'] = 'CEVA Logistics - Depot Toamasina | Date: 03/04/2026 | Base: 1 tache simple = 2h, 1 JH = 8h'
ws1['A2'].font = Font(name='Calibri', italic=True, size=10, color='666666')
ws1['A2'].alignment = Alignment(horizontal='center')

# Headers
headers = ['ID', 'User Story / Tache', 'Complexite', 'Heures', 'JH', 'Epic']
row = 4
for i, h in enumerate(headers, 1):
    ws1.cell(row=row, column=i, value=h)
style_header(ws1, row, 6)

# Data
backlog = [
    # Epic 1
    ('EPIC', 'E1 - Infrastructure & Setup Technique', '', '', '', ''),
    ('E1-01', 'Initialisation projet (repo Git, CI/CD pipeline, environnements dev/staging/prod)', 'Moyenne', 8, 1.0, 'E1'),
    ('E1-02', 'Setup framework frontend (React + Vite + TypeScript migration)', 'Simple', 4, 0.5, 'E1'),
    ('E1-03', 'Mise en place du Design System (tokens CSS, composants de base, theme sombre)', 'Moyenne', 12, 1.5, 'E1'),
    ('E1-04', 'Architecture backend (choix framework, structure projet, configuration)', 'Moyenne', 8, 1.0, 'E1'),
    ('E1-05', 'Conception et implementation du schema de base de donnees', 'Complexe', 16, 2.0, 'E1'),
    ('E1-06', 'Mise en place authentification et gestion des roles (JWT, RBAC)', 'Complexe', 20, 2.5, 'E1'),
    ('E1-07', 'Configuration Docker / conteneurisation', 'Moyenne', 8, 1.0, 'E1'),
    ('SUBTOTAL', 'Sous-total Epic 1', '', 76, 9.5, ''),
    # Epic 2
    ('EPIC', 'E2 - Grille du Yard & Visualisation', '', '', '', ''),
    ('E2-01', 'Grille multi-zones (A/B/C/R) avec Bay x Row', 'Complexe', 16, 2.0, 'E2'),
    ('E2-02', 'Affichage conteneur sommet de pile (taille, type, indicateur reefer)', 'Moyenne', 12, 1.5, 'E2'),
    ('E2-03', 'Indicateurs de pile (1-3 niveaux) par cellule', 'Moyenne', 8, 1.0, 'E2'),
    ('E2-04', 'Filtrage par zone (onglets All / Zone A / B / C / R)', 'Simple', 4, 0.5, 'E2'),
    ('E2-05', 'Labels de position (Bay01-R01) sur la grille', 'Simple', 4, 0.5, 'E2'),
    ('E2-06', 'Tooltip au survol avec detail de la pile', 'Moyenne', 8, 1.0, 'E2'),
    ('E2-07', 'Responsive design et adaptation multi-ecrans', 'Complexe', 16, 2.0, 'E2'),
    ('SUBTOTAL', 'Sous-total Epic 2', '', 68, 8.5, ''),
    # Epic 3
    ('EPIC', 'E3 - Drag & Drop de Conteneurs', '', '', '', ''),
    ('E3-01', 'Deplacement conteneur par glisser-deposer entre cellules', 'Complexe', 20, 2.5, 'E3'),
    ('E3-02', 'Validation regles empilage (max 3 niveaux, 40\' pas sur 20\')', 'Moyenne', 12, 1.5, 'E3'),
    ('E3-03', 'Feedback visuel (ghost cursor, surbrillance valide/invalide)', 'Moyenne', 12, 1.5, 'E3'),
    ('E3-04', 'Animation de confirmation et MAJ grille apres deplacement', 'Simple', 6, 0.75, 'E3'),
    ('E3-05', 'Contrainte : seul conteneur sommet de pile deplacable', 'Simple', 4, 0.5, 'E3'),
    ('SUBTOTAL', 'Sous-total Epic 3', '', 54, 6.75, ''),
    # Epic 4
    ('EPIC', 'E4 - Gestion des Conteneurs', '', '', '', ''),
    ('E4-01', 'API CRUD conteneurs (creation, lecture, MAJ, suppression)', 'Complexe', 16, 2.0, 'E4'),
    ('E4-02', 'Panneau detail conteneur (ID, type, ISO, position, client, poids, dates, accessibilite)', 'Moyenne', 12, 1.5, 'E4'),
    ('E4-03', 'Vue en elevation de la pile (clic droit popup)', 'Moyenne', 12, 1.5, 'E4'),
    ('E4-04', 'Recherche conteneur par ID (temps reel, min 3 caracteres)', 'Moyenne', 10, 1.25, 'E4'),
    ('E4-05', 'Filtrage par type (6 types) avec compteurs', 'Moyenne', 8, 1.0, 'E4'),
    ('E4-06', 'Gestion des 6 types de conteneurs avec codes ISO 6346', 'Simple', 4, 0.5, 'E4'),
    ('SUBTOTAL', 'Sous-total Epic 4', '', 62, 7.75, ''),
    # Epic 5
    ('EPIC', 'E5 - Gestionnaire de Mouvements', '', '', '', ''),
    ('E5-01', 'Workflow arrivee conteneur (ID auto/manuel, type, client, poids, zone, placement)', 'Complexe', 20, 2.5, 'E5'),
    ('E5-02', 'Workflow depart conteneur (recherche, validation accessibilite, confirmation)', 'Moyenne', 12, 1.5, 'E5'),
    ('E5-03', 'Transfert conteneur entre zones (recherche, zone cible, auto-placement)', 'Complexe', 16, 2.0, 'E5'),
    ('E5-04', 'Journal des mouvements (arrivee/depart/transfert avec horodatage)', 'Moyenne', 12, 1.5, 'E5'),
    ('E5-05', 'Algorithme auto-placement (regles empilage + capacite)', 'Complexe', 16, 2.0, 'E5'),
    ('SUBTOTAL', 'Sous-total Epic 5', '', 76, 9.5, ''),
    # Epic 6
    ('EPIC', 'E6 - Gestion des Zones', '', '', '', ''),
    ('E6-01', 'Creation de zone (ID, label, dimensions lignes x colonnes)', 'Moyenne', 12, 1.5, 'E6'),
    ('E6-02', 'Modification de zone (label, dimensions avec validation anti-perte)', 'Complexe', 16, 2.0, 'E6'),
    ('E6-03', 'Suppression de zone (uniquement si vide, confirmation)', 'Simple', 6, 0.75, 'E6'),
    ('E6-04', 'Liste des zones avec capacite et taux occupation', 'Simple', 6, 0.75, 'E6'),
    ('E6-05', 'Algorithme compaction de zone (reorganisation par taille et date sortie)', 'Complexe', 20, 2.5, 'E6'),
    ('E6-06', 'Compaction globale (toutes les zones)', 'Moyenne', 8, 1.0, 'E6'),
    ('SUBTOTAL', 'Sous-total Epic 6', '', 68, 8.5, ''),
    # Epic 7
    ('EPIC', 'E7 - Monitoring Reefer', '', '', '', ''),
    ('E7-01', 'Tableau de bord reefer (total, alertes temperature, power off)', 'Moyenne', 10, 1.25, 'E7'),
    ('E7-02', 'Filtrage reefers (tous / alertes / power off)', 'Simple', 6, 0.75, 'E7'),
    ('E7-03', 'Carte detaillee reefer (commodity, temperatures, power, ventilation, humidite)', 'Complexe', 16, 2.0, 'E7'),
    ('E7-04', 'Gestion 8 types commodites avec plages temperature', 'Moyenne', 8, 1.0, 'E7'),
    ('E7-05', 'Systeme alertes temperature (detection hors plage, indicateurs visuels)', 'Complexe', 16, 2.0, 'E7'),
    ('E7-06', 'Integration IoT / capteurs pour temperature temps reel', 'Complexe', 24, 3.0, 'E7'),
    ('SUBTOTAL', 'Sous-total Epic 7', '', 80, 10.0, ''),
    # Epic 8
    ('EPIC', 'E8 - Dashboard & Analytique', '', '', '', ''),
    ('E8-01', 'KPI principaux (total conteneurs, occupation, reefers, alertes)', 'Moyenne', 8, 1.0, 'E8'),
    ('E8-02', 'Graphique occupation par zone (bar chart)', 'Moyenne', 10, 1.25, 'E8'),
    ('E8-03', 'Distribution par type de conteneur (doughnut chart)', 'Moyenne', 8, 1.0, 'E8'),
    ('E8-04', 'Analyse temps de sejour / dwell time (histogram)', 'Moyenne', 12, 1.5, 'E8'),
    ('E8-05', 'Tableau detaille par zone (conteneurs, capacite, occupation)', 'Simple', 6, 0.75, 'E8'),
    ('E8-06', 'Export donnees analytiques (CSV / PDF)', 'Moyenne', 12, 1.5, 'E8'),
    ('SUBTOTAL', 'Sous-total Epic 8', '', 56, 7.0, ''),
    # Epic 9
    ('EPIC', 'E9 - Historique & Undo', '', '', '', ''),
    ('E9-01', 'Historique des 20 derniers deplacements (source, destination, horodatage)', 'Moyenne', 10, 1.25, 'E9'),
    ('E9-02', 'Annulation deplacement (validation faisabilite, restitution)', 'Complexe', 16, 2.0, 'E9'),
    ('E9-03', 'Persistance historique en BDD avec audit trail', 'Moyenne', 12, 1.5, 'E9'),
    ('SUBTOTAL', 'Sous-total Epic 9', '', 38, 4.75, ''),
    # Epic 10
    ('EPIC', 'E10 - Notifications & UX', '', '', '', ''),
    ('E10-01', 'Systeme notifications toast (succes, erreur, info) avec auto-dismiss', 'Simple', 6, 0.75, 'E10'),
    ('E10-02', 'Raccourcis clavier (Escape fermeture modales, navigation)', 'Simple', 4, 0.5, 'E10'),
    ('E10-03', 'Horloge temps reel et badge statut live', 'Simple', 4, 0.5, 'E10'),
    ('E10-04', 'Systeme modales reutilisable (overlay, fermeture externe)', 'Moyenne', 8, 1.0, 'E10'),
    ('SUBTOTAL', 'Sous-total Epic 10', '', 22, 2.75, ''),
    # Epic 11
    ('EPIC', 'E11 - Integration Backend & Temps Reel', '', '', '', ''),
    ('E11-01', 'API REST complete (conteneurs, zones, mouvements, reefers, dashboard)', 'Complexe', 32, 4.0, 'E11'),
    ('E11-02', 'WebSocket pour MAJ temps reel (mouvements, alertes reefer)', 'Complexe', 20, 2.5, 'E11'),
    ('E11-03', 'Integration CargoWise (synchronisation donnees conteneurs)', 'Tres complexe', 32, 4.0, 'E11'),
    ('E11-04', 'Gestion conflits multi-utilisateurs (optimistic locking)', 'Complexe', 16, 2.0, 'E11'),
    ('E11-05', 'Cache et optimisation performances (pagination, lazy loading)', 'Moyenne', 12, 1.5, 'E11'),
    ('SUBTOTAL', 'Sous-total Epic 11', '', 112, 14.0, ''),
    # Epic 12
    ('EPIC', 'E12 - Tests & Qualite', '', '', '', ''),
    ('E12-01', 'Tests unitaires frontend (composants React, hooks, rules)', 'Complexe', 32, 4.0, 'E12'),
    ('E12-02', 'Tests unitaires backend (API, services, validations)', 'Complexe', 24, 3.0, 'E12'),
    ('E12-03', 'Tests integration (frontend-backend, API, BDD)', 'Complexe', 20, 2.5, 'E12'),
    ('E12-04', 'Tests end-to-end (scenarios utilisateur avec Playwright/Cypress)', 'Complexe', 24, 3.0, 'E12'),
    ('E12-05', 'Tests de performance et charge', 'Moyenne', 12, 1.5, 'E12'),
    ('E12-06', 'Correction bugs et stabilisation', 'Moyenne', 16, 2.0, 'E12'),
    ('SUBTOTAL', 'Sous-total Epic 12', '', 128, 16.0, ''),
]

row = 5
for item in backlog:
    if item[0] == 'EPIC':
        ws1.merge_cells(start_row=row, start_column=1, end_row=row, end_column=6)
        ws1.cell(row=row, column=1, value=item[1])
        for c in range(1, 7):
            cell = ws1.cell(row=row, column=c)
            cell.font = epic_font
            cell.fill = epic_fill
            cell.alignment = Alignment(horizontal='left', vertical='center')
            cell.border = thin_border
    elif item[0] == 'SUBTOTAL':
        for i, val in enumerate(item, 1):
            ws1.cell(row=row, column=i, value=val if val != '' else None)
        style_row(ws1, row, 6, subtotal_font, subtotal_fill)
    else:
        for i, val in enumerate(item, 1):
            ws1.cell(row=row, column=i, value=val if val != '' else None)
        style_row(ws1, row, 6)
    row += 1

# Grand total
row += 1
ws1.merge_cells(start_row=row, start_column=1, end_row=row, end_column=3)
ws1.cell(row=row, column=1, value='TOTAL DEVELOPPEMENT')
ws1.cell(row=row, column=4, value=840)
ws1.cell(row=row, column=5, value=105.5)
for c in range(1, 7):
    cell = ws1.cell(row=row, column=c)
    cell.font = total_font
    cell.fill = total_fill
    cell.alignment = center
    cell.border = thin_border

# Column widths
ws1.column_dimensions['A'].width = 10
ws1.column_dimensions['B'].width = 70
ws1.column_dimensions['C'].width = 15
ws1.column_dimensions['D'].width = 10
ws1.column_dimensions['E'].width = 8
ws1.column_dimensions['F'].width = 8

# ============================================================
# ONGLET 2 : CHARGES COMPLEMENTAIRES
# ============================================================
ws2 = wb.create_sheet("Charges Complementaires")

ws2.merge_cells('A1:E1')
ws2['A1'] = 'CCIS Yard View - Charges Complementaires (hors developpement)'
ws2['A1'].font = title_font
ws2['A1'].alignment = Alignment(horizontal='center', vertical='center')
ws2.row_dimensions[1].height = 30

headers2 = ['ID', 'Activite', 'Description', 'Heures', 'JH']
for i, h in enumerate(headers2, 1):
    ws2.cell(row=3, column=i, value=h)
style_header(ws2, 3, 5)

charges = [
    ('CC-01', 'Gestion de projet', 'Pilotage, suivi avancement, coordination equipe, reporting client, comites de pilotage, gestion des risques', 96, 12),
    ('CC-02', 'Specifications fonctionnelles', 'Redaction des specs detaillees, user stories, criteres d\'acceptation, diagrammes de flux', 48, 6),
    ('CC-03', 'Specifications techniques', 'Architecture technique, choix technologiques, diagrammes UML, API design', 32, 4),
    ('CC-04', 'UX/UI Design', 'Maquettes haute fidelite (Figma), prototypage interactif, charte graphique, design review', 64, 8),
    ('CC-05', 'Recette / QA', 'Redaction plan de tests, campagnes de recette, PV de recette, suivi des anomalies', 48, 6),
    ('CC-06', 'Documentation technique', 'Documentation architecture, API (Swagger/OpenAPI), guide deploiement, runbook', 24, 3),
    ('CC-07', 'Documentation utilisateur', 'Guide utilisateur, FAQ, aide contextuelle, videos tutorielles', 24, 3),
    ('CC-08', 'Formation utilisateurs', 'Preparation supports, sessions de formation operateurs et managers', 16, 2),
    ('CC-09', 'Deploiement & DevOps', 'Infra production, monitoring (logs, APM), CI/CD prod, SSL, backup, scalabilite', 40, 5),
    ('CC-10', 'Support post-livraison', 'Garantie 1 mois, correction anomalies, support niveau 2, transfert de competences', 40, 5),
]

for i, c in enumerate(charges):
    r = 4 + i
    for j, val in enumerate(c, 1):
        ws2.cell(row=r, column=j, value=val)
    style_row(ws2, r, 5)

# Total
r = 4 + len(charges) + 1
ws2.merge_cells(start_row=r, start_column=1, end_row=r, end_column=3)
ws2.cell(row=r, column=1, value='TOTAL CHARGES COMPLEMENTAIRES')
ws2.cell(row=r, column=4, value=432)
ws2.cell(row=r, column=5, value=54)
for c in range(1, 6):
    cell = ws2.cell(row=r, column=c)
    cell.font = total_font
    cell.fill = total_fill
    cell.alignment = center
    cell.border = thin_border

# Grand total
r += 2
ws2.merge_cells(start_row=r, start_column=1, end_row=r, end_column=3)
ws2.cell(row=r, column=1, value='TOTAL PROJET (Dev + Complementaires)')
ws2.cell(row=r, column=4, value=1272)
ws2.cell(row=r, column=5, value=159.5)
for c in range(1, 6):
    cell = ws2.cell(row=r, column=c)
    cell.font = Font(name='Calibri', bold=True, size=13, color='FFFFFF')
    cell.fill = PatternFill(start_color='C00000', end_color='C00000', fill_type='solid')
    cell.alignment = center
    cell.border = thin_border

ws2.column_dimensions['A'].width = 10
ws2.column_dimensions['B'].width = 30
ws2.column_dimensions['C'].width = 75
ws2.column_dimensions['D'].width = 10
ws2.column_dimensions['E'].width = 8

# ============================================================
# ONGLET 3 : MACRO PLANNING
# ============================================================
ws3 = wb.create_sheet("Macro Planning")

ws3.merge_cells('A1:L1')
ws3['A1'] = 'CCIS Yard View - Macro Planning'
ws3['A1'].font = title_font
ws3['A1'].alignment = Alignment(horizontal='center', vertical='center')
ws3.row_dimensions[1].height = 30

ws3.merge_cells('A2:L2')
ws3['A2'] = 'Equipe: 2 developpeurs + 1 chef de projet (partiel) | Sprint: 2 semaines | Duree totale: 20 semaines (~5 mois)'
ws3['A2'].font = Font(name='Calibri', italic=True, size=10, color='666666')
ws3['A2'].alignment = Alignment(horizontal='center')

# Headers
plan_headers = ['Sprint', 'Periode', 'Semaines', 'Epics / Activites', 'Charge (JH)', 'Jalon', 'S1-S2', 'S3-S4', 'S5-S6', 'S7-S8', 'S9-S10', 'S11-S12', 'S13-S14', 'S15-S16', 'S17-S18', 'S19-S20']
for i, h in enumerate(plan_headers, 1):
    ws3.cell(row=4, column=i, value=h)
style_header(ws3, 4, len(plan_headers))

sprint_fill = PatternFill(start_color='BDD7EE', end_color='BDD7EE', fill_type='solid')
jalon_fill = PatternFill(start_color='FFC000', end_color='FFC000', fill_type='solid')

sprints = [
    ('Sprint 0', 'Cadrage', 'S1-S2', 'Specs fonctionnelles + UX/UI Design', 18, 'J1: Cadrage valide', 0),
    ('Sprint 1', 'Setup', 'S3-S4', 'E1 - Infrastructure & Setup Technique', 9.5, 'J2: Env. pret', 1),
    ('Sprint 2', 'Core UI', 'S5-S6', 'E2 - Grille Yard + E10 - Notifications/UX', 11.25, '', 2),
    ('Sprint 3', 'Core Fonc.', 'S7-S8', 'E3 - Drag & Drop + E4 - Gestion Conteneurs', 14.5, 'J3: MVP Core', 3),
    ('Sprint 4', 'Operations', 'S9-S10', 'E5 - Mouvements + E6 - Zones', 18, '', 4),
    ('Sprint 5', 'Monitoring', 'S11-S12', 'E7 - Reefer + E8 - Dashboard', 17, 'J4: Features completes', 5),
    ('Sprint 6', 'Backend 1', 'S13-S14', 'E11 - Integration Backend (partie 1)', 10.5, '', 6),
    ('Sprint 7', 'Backend 2', 'S15-S16', 'E11 - Integration Backend (partie 2) + E9 - Historique', 8.25, 'J5: Backend integre', 7),
    ('Sprint 8', 'Tests', 'S17-S18', 'E12 - Tests & Qualite', 16, '', 8),
    ('Sprint 9', 'Livraison', 'S19-S20', 'Recette + Deploiement + Formation', 13, 'J6: Mise en production', 9),
]

for i, s in enumerate(sprints):
    r = 5 + i
    ws3.cell(row=r, column=1, value=s[0])
    ws3.cell(row=r, column=2, value=s[1])
    ws3.cell(row=r, column=3, value=s[2])
    ws3.cell(row=r, column=4, value=s[3])
    ws3.cell(row=r, column=5, value=s[4])
    ws3.cell(row=r, column=6, value=s[5])
    style_row(ws3, r, len(plan_headers))

    # Gantt-like coloring
    gantt_col = 7 + s[6]  # column index for the sprint period
    cell = ws3.cell(row=r, column=gantt_col)
    cell.fill = sprint_fill
    cell.value = f'{s[4]} JH'
    cell.font = Font(name='Calibri', bold=True, size=9)

    # Jalon marker
    if s[5]:
        cell.fill = jalon_fill
        cell.value = s[5].split(':')[0]  # Just "J1", "J2", etc.
        cell.font = Font(name='Calibri', bold=True, size=9, color='C00000')

# Total row
r = 5 + len(sprints) + 1
ws3.merge_cells(start_row=r, start_column=1, end_row=r, end_column=4)
ws3.cell(row=r, column=1, value='TOTAL PROJET')
ws3.cell(row=r, column=5, value=136)
for c in range(1, len(plan_headers) + 1):
    cell = ws3.cell(row=r, column=c)
    cell.font = total_font
    cell.fill = total_fill
    cell.alignment = center
    cell.border = thin_border

# Jalons summary
r += 2
ws3.merge_cells(start_row=r, start_column=1, end_row=r, end_column=6)
ws3.cell(row=r, column=1, value='JALONS DU PROJET')
ws3.cell(row=r, column=1).font = Font(name='Calibri', bold=True, size=12, color='2F5496')
r += 1

jalons = [
    ('J1', 'Cadrage valide', 'Fin S2', 'Specifications et maquettes validees par le client'),
    ('J2', 'Environnement pret', 'Fin S4', 'Infra, CI/CD, authentification, BDD operationnels'),
    ('J3', 'MVP Core', 'Fin S8', 'Grille yard, drag & drop, gestion conteneurs fonctionnels'),
    ('J4', 'Features completes', 'Fin S12', 'Toutes fonctionnalites metier implementees (reefer, dashboard, mouvements)'),
    ('J5', 'Backend integre', 'Fin S16', 'API REST, WebSocket, integration CargoWise operationnels'),
    ('J6', 'Mise en production', 'Fin S20', 'Application deployee, testee, documentee, equipe formee'),
]

jalon_headers = ['Jalon', 'Intitule', 'Echeance', 'Critere de validation']
for i, h in enumerate(jalon_headers, 1):
    ws3.cell(row=r, column=i, value=h)
style_header(ws3, r, 4)

for j in jalons:
    r += 1
    for i, val in enumerate(j, 1):
        ws3.cell(row=r, column=i, value=val)
    style_row(ws3, r, 4)
    # Highlight jalon ID
    ws3.cell(row=r, column=1).fill = jalon_fill
    ws3.cell(row=r, column=1).font = Font(name='Calibri', bold=True)

ws3.column_dimensions['A'].width = 12
ws3.column_dimensions['B'].width = 14
ws3.column_dimensions['C'].width = 10
ws3.column_dimensions['D'].width = 60
ws3.column_dimensions['E'].width = 12
ws3.column_dimensions['F'].width = 25
for col_idx in range(7, 17):
    ws3.column_dimensions[get_column_letter(col_idx)].width = 14

# ============================================================
# SAVE
# ============================================================
output = 'E:/projects/CCIS/ccis-yard-view/CCIS_YardView_Backlog.xlsx'
wb.save(output)
print(f'Excel genere: {output}')
