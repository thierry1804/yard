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
gain_high = PatternFill(start_color='C6EFCE', end_color='C6EFCE', fill_type='solid')  # green
gain_mid = PatternFill(start_color='FFEB9C', end_color='FFEB9C', fill_type='solid')   # yellow
gain_low = PatternFill(start_color='FFC7CE', end_color='FFC7CE', fill_type='solid')   # red/pink
ia_accent = PatternFill(start_color='7030A0', end_color='7030A0', fill_type='solid')
ia_accent_font = Font(name='Calibri', bold=True, size=12, color='FFFFFF')
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

def gain_fill(pct):
    if pct >= 45: return gain_high
    if pct >= 30: return gain_mid
    return gain_low

# ============================================================
# ONGLET 1 : BACKLOG CHIFFRE (COMPARATIF)
# ============================================================
ws1 = wb.active
ws1.title = "Backlog Chiffre IA"

ws1.merge_cells('A1:H1')
ws1['A1'] = 'CCIS Yard View - Backlog Chiffre (Developpeurs assistes par IA)'
ws1['A1'].font = title_font
ws1['A1'].alignment = Alignment(horizontal='center', vertical='center')
ws1.row_dimensions[1].height = 30

ws1.merge_cells('A2:H2')
ws1['A2'] = 'CEVA Logistics - Depot Toamasina | Date: 03/04/2026 | Assistance: Claude / Cursor | Base: 1 tache simple = 2h, 1 JH = 8h'
ws1['A2'].font = Font(name='Calibri', italic=True, size=10, color='666666')
ws1['A2'].alignment = Alignment(horizontal='center')

headers = ['ID', 'User Story / Tache', 'Complexite', 'Sans IA (h)', 'Avec IA (h)', 'JH IA', 'Gain (%)', 'Epic']
row = 4
for i, h in enumerate(headers, 1):
    ws1.cell(row=row, column=i, value=h)
style_header(ws1, row, 8)

backlog = [
    # Epic 1
    ('EPIC', 'E1 - Infrastructure & Setup Technique', '', '', '', '', '', ''),
    ('E1-01', 'Initialisation projet (repo Git, CI/CD pipeline, environnements)', 'Moyenne', 8, 5, 0.625, '38%', 'E1'),
    ('E1-02', 'Setup framework frontend (React + Vite + TypeScript migration)', 'Simple', 4, 2, 0.25, '50%', 'E1'),
    ('E1-03', 'Mise en place du Design System (tokens CSS, composants, theme)', 'Moyenne', 12, 7, 0.875, '42%', 'E1'),
    ('E1-04', 'Architecture backend (framework, structure, configuration)', 'Moyenne', 8, 6, 0.75, '25%', 'E1'),
    ('E1-05', 'Conception et implementation schema BDD', 'Complexe', 16, 10, 1.25, '38%', 'E1'),
    ('E1-06', 'Authentification et gestion des roles (JWT, RBAC)', 'Complexe', 20, 12, 1.5, '40%', 'E1'),
    ('E1-07', 'Configuration Docker / conteneurisation', 'Moyenne', 8, 4, 0.5, '50%', 'E1'),
    ('SUBTOTAL', 'Sous-total Epic 1', '', 76, 46, 5.75, '39%', ''),

    ('EPIC', 'E2 - Grille du Yard & Visualisation', '', '', '', '', '', ''),
    ('E2-01', 'Grille multi-zones (A/B/C/R) avec Bay x Row', 'Complexe', 16, 10, 1.25, '38%', 'E2'),
    ('E2-02', 'Affichage conteneur sommet de pile (taille, type, reefer)', 'Moyenne', 12, 7, 0.875, '42%', 'E2'),
    ('E2-03', 'Indicateurs de pile (1-3 niveaux) par cellule', 'Moyenne', 8, 4, 0.5, '50%', 'E2'),
    ('E2-04', 'Filtrage par zone (onglets All / Zone A / B / C / R)', 'Simple', 4, 2, 0.25, '50%', 'E2'),
    ('E2-05', 'Labels de position (Bay01-R01) sur la grille', 'Simple', 4, 2, 0.25, '50%', 'E2'),
    ('E2-06', 'Tooltip au survol avec detail de la pile', 'Moyenne', 8, 4, 0.5, '50%', 'E2'),
    ('E2-07', 'Responsive design et adaptation multi-ecrans', 'Complexe', 16, 10, 1.25, '38%', 'E2'),
    ('SUBTOTAL', 'Sous-total Epic 2', '', 68, 39, 4.875, '43%', ''),

    ('EPIC', 'E3 - Drag & Drop de Conteneurs', '', '', '', '', '', ''),
    ('E3-01', 'Deplacement conteneur par glisser-deposer', 'Complexe', 20, 14, 1.75, '30%', 'E3'),
    ('E3-02', 'Validation regles empilage (max 3, 40\' pas sur 20\')', 'Moyenne', 12, 7, 0.875, '42%', 'E3'),
    ('E3-03', 'Feedback visuel (ghost, surbrillance valide/invalide)', 'Moyenne', 12, 7, 0.875, '42%', 'E3'),
    ('E3-04', 'Animation confirmation et MAJ grille', 'Simple', 6, 3, 0.375, '50%', 'E3'),
    ('E3-05', 'Contrainte : seul conteneur sommet deplacable', 'Simple', 4, 2, 0.25, '50%', 'E3'),
    ('SUBTOTAL', 'Sous-total Epic 3', '', 54, 33, 4.125, '39%', ''),

    ('EPIC', 'E4 - Gestion des Conteneurs', '', '', '', '', '', ''),
    ('E4-01', 'API CRUD conteneurs', 'Complexe', 16, 8, 1.0, '50%', 'E4'),
    ('E4-02', 'Panneau detail conteneur complet', 'Moyenne', 12, 6, 0.75, '50%', 'E4'),
    ('E4-03', 'Vue elevation pile (clic droit popup)', 'Moyenne', 12, 7, 0.875, '42%', 'E4'),
    ('E4-04', 'Recherche conteneur par ID temps reel', 'Moyenne', 10, 5, 0.625, '50%', 'E4'),
    ('E4-05', 'Filtrage par type (6 types) avec compteurs', 'Moyenne', 8, 4, 0.5, '50%', 'E4'),
    ('E4-06', 'Gestion types conteneurs avec codes ISO 6346', 'Simple', 4, 2, 0.25, '50%', 'E4'),
    ('SUBTOTAL', 'Sous-total Epic 4', '', 62, 32, 4.0, '48%', ''),

    ('EPIC', 'E5 - Gestionnaire de Mouvements', '', '', '', '', '', ''),
    ('E5-01', 'Workflow arrivee conteneur complet', 'Complexe', 20, 12, 1.5, '40%', 'E5'),
    ('E5-02', 'Workflow depart conteneur', 'Moyenne', 12, 7, 0.875, '42%', 'E5'),
    ('E5-03', 'Transfert conteneur entre zones', 'Complexe', 16, 10, 1.25, '38%', 'E5'),
    ('E5-04', 'Journal des mouvements avec horodatage', 'Moyenne', 12, 6, 0.75, '50%', 'E5'),
    ('E5-05', 'Algorithme auto-placement', 'Complexe', 16, 10, 1.25, '38%', 'E5'),
    ('SUBTOTAL', 'Sous-total Epic 5', '', 76, 45, 5.625, '41%', ''),

    ('EPIC', 'E6 - Gestion des Zones', '', '', '', '', '', ''),
    ('E6-01', 'Creation de zone (ID, label, dimensions)', 'Moyenne', 12, 6, 0.75, '50%', 'E6'),
    ('E6-02', 'Modification zone avec validation anti-perte', 'Complexe', 16, 10, 1.25, '38%', 'E6'),
    ('E6-03', 'Suppression zone (si vide, confirmation)', 'Simple', 6, 3, 0.375, '50%', 'E6'),
    ('E6-04', 'Liste zones avec capacite et occupation', 'Simple', 6, 3, 0.375, '50%', 'E6'),
    ('E6-05', 'Algorithme compaction de zone', 'Complexe', 20, 14, 1.75, '30%', 'E6'),
    ('E6-06', 'Compaction globale toutes zones', 'Moyenne', 8, 4, 0.5, '50%', 'E6'),
    ('SUBTOTAL', 'Sous-total Epic 6', '', 68, 40, 5.0, '41%', ''),

    ('EPIC', 'E7 - Monitoring Reefer', '', '', '', '', '', ''),
    ('E7-01', 'Tableau de bord reefer (KPIs)', 'Moyenne', 10, 5, 0.625, '50%', 'E7'),
    ('E7-02', 'Filtrage reefers (tous / alertes / power off)', 'Simple', 6, 3, 0.375, '50%', 'E7'),
    ('E7-03', 'Carte detaillee reefer complete', 'Complexe', 16, 9, 1.125, '44%', 'E7'),
    ('E7-04', 'Gestion 8 commodites avec plages temperature', 'Moyenne', 8, 4, 0.5, '50%', 'E7'),
    ('E7-05', 'Systeme alertes temperature', 'Complexe', 16, 10, 1.25, '38%', 'E7'),
    ('E7-06', 'Integration IoT / capteurs temps reel', 'Complexe', 24, 20, 2.5, '17%', 'E7'),
    ('SUBTOTAL', 'Sous-total Epic 7', '', 80, 51, 6.375, '36%', ''),

    ('EPIC', 'E8 - Dashboard & Analytique', '', '', '', '', '', ''),
    ('E8-01', 'KPI principaux', 'Moyenne', 8, 4, 0.5, '50%', 'E8'),
    ('E8-02', 'Graphique occupation par zone (bar chart)', 'Moyenne', 10, 5, 0.625, '50%', 'E8'),
    ('E8-03', 'Distribution par type (doughnut chart)', 'Moyenne', 8, 4, 0.5, '50%', 'E8'),
    ('E8-04', 'Analyse dwell time (histogram)', 'Moyenne', 12, 6, 0.75, '50%', 'E8'),
    ('E8-05', 'Tableau detaille par zone', 'Simple', 6, 3, 0.375, '50%', 'E8'),
    ('E8-06', 'Export analytiques (CSV / PDF)', 'Moyenne', 12, 6, 0.75, '50%', 'E8'),
    ('SUBTOTAL', 'Sous-total Epic 8', '', 56, 28, 3.5, '50%', ''),

    ('EPIC', 'E9 - Historique & Undo', '', '', '', '', '', ''),
    ('E9-01', 'Historique 20 derniers deplacements', 'Moyenne', 10, 5, 0.625, '50%', 'E9'),
    ('E9-02', 'Annulation deplacement avec validation', 'Complexe', 16, 10, 1.25, '38%', 'E9'),
    ('E9-03', 'Persistance historique BDD + audit trail', 'Moyenne', 12, 6, 0.75, '50%', 'E9'),
    ('SUBTOTAL', 'Sous-total Epic 9', '', 38, 21, 2.625, '45%', ''),

    ('EPIC', 'E10 - Notifications & UX', '', '', '', '', '', ''),
    ('E10-01', 'Notifications toast (succes/erreur/info)', 'Simple', 6, 3, 0.375, '50%', 'E10'),
    ('E10-02', 'Raccourcis clavier', 'Simple', 4, 2, 0.25, '50%', 'E10'),
    ('E10-03', 'Horloge temps reel et badge live', 'Simple', 4, 2, 0.25, '50%', 'E10'),
    ('E10-04', 'Systeme modales reutilisable', 'Moyenne', 8, 4, 0.5, '50%', 'E10'),
    ('SUBTOTAL', 'Sous-total Epic 10', '', 22, 11, 1.375, '50%', ''),

    ('EPIC', 'E11 - Integration Backend & Temps Reel', '', '', '', '', '', ''),
    ('E11-01', 'API REST complete (tous endpoints)', 'Complexe', 32, 16, 2.0, '50%', 'E11'),
    ('E11-02', 'WebSocket temps reel (mouvements, alertes)', 'Complexe', 20, 14, 1.75, '30%', 'E11'),
    ('E11-03', 'Integration CargoWise', 'Tres complexe', 32, 26, 3.25, '19%', 'E11'),
    ('E11-04', 'Gestion conflits multi-utilisateurs', 'Complexe', 16, 10, 1.25, '38%', 'E11'),
    ('E11-05', 'Cache et optimisation performances', 'Moyenne', 12, 7, 0.875, '42%', 'E11'),
    ('SUBTOTAL', 'Sous-total Epic 11', '', 112, 73, 9.125, '35%', ''),

    ('EPIC', 'E12 - Tests & Qualite', '', '', '', '', '', ''),
    ('E12-01', 'Tests unitaires frontend', 'Complexe', 32, 16, 2.0, '50%', 'E12'),
    ('E12-02', 'Tests unitaires backend', 'Complexe', 24, 12, 1.5, '50%', 'E12'),
    ('E12-03', 'Tests integration', 'Complexe', 20, 12, 1.5, '40%', 'E12'),
    ('E12-04', 'Tests end-to-end (Playwright/Cypress)', 'Complexe', 24, 14, 1.75, '42%', 'E12'),
    ('E12-05', 'Tests performance et charge', 'Moyenne', 12, 8, 1.0, '33%', 'E12'),
    ('E12-06', 'Correction bugs et stabilisation', 'Moyenne', 16, 10, 1.25, '38%', 'E12'),
    ('SUBTOTAL', 'Sous-total Epic 12', '', 128, 72, 9.0, '44%', ''),
]

row = 5
for item in backlog:
    if item[0] == 'EPIC':
        ws1.merge_cells(start_row=row, start_column=1, end_row=row, end_column=8)
        ws1.cell(row=row, column=1, value=item[1])
        for c in range(1, 9):
            cell = ws1.cell(row=row, column=c)
            cell.font = epic_font
            cell.fill = epic_fill
            cell.alignment = Alignment(horizontal='left', vertical='center')
            cell.border = thin_border
    elif item[0] == 'SUBTOTAL':
        for i, val in enumerate(item, 1):
            ws1.cell(row=row, column=i, value=val if val != '' else None)
        style_row(ws1, row, 8, subtotal_font, subtotal_fill)
    else:
        for i, val in enumerate(item, 1):
            ws1.cell(row=row, column=i, value=val if val != '' else None)
        style_row(ws1, row, 8)
        # Color the gain column
        gain_str = item[6]
        if gain_str:
            pct = int(gain_str.replace('%', ''))
            ws1.cell(row=row, column=7).fill = gain_fill(pct)
    row += 1

# Grand totals
row += 1
# Without AI
ws1.merge_cells(start_row=row, start_column=1, end_row=row, end_column=2)
ws1.cell(row=row, column=1, value='TOTAL DEV SANS IA')
ws1.cell(row=row, column=4, value=840)
ws1.cell(row=row, column=6, value=105.5)
for c in range(1, 9):
    cell = ws1.cell(row=row, column=c)
    cell.font = Font(name='Calibri', bold=True, size=11)
    cell.fill = PatternFill(start_color='E2EFDA', end_color='E2EFDA', fill_type='solid')
    cell.alignment = center
    cell.border = thin_border

row += 1
# With AI
ws1.merge_cells(start_row=row, start_column=1, end_row=row, end_column=2)
ws1.cell(row=row, column=1, value='TOTAL DEV AVEC IA')
ws1.cell(row=row, column=5, value=491)
ws1.cell(row=row, column=6, value=61.375)
ws1.cell(row=row, column=7, value='42%')
for c in range(1, 9):
    cell = ws1.cell(row=row, column=c)
    cell.font = ia_accent_font
    cell.fill = ia_accent
    cell.alignment = center
    cell.border = thin_border

row += 1
# Savings
ws1.merge_cells(start_row=row, start_column=1, end_row=row, end_column=2)
ws1.cell(row=row, column=1, value='ECONOMIE GRACE A L\'IA')
ws1.cell(row=row, column=6, value=44.125)
ws1.cell(row=row, column=7, value='42%')
for c in range(1, 9):
    cell = ws1.cell(row=row, column=c)
    cell.font = Font(name='Calibri', bold=True, size=12, color='006100')
    cell.fill = gain_high
    cell.alignment = center
    cell.border = thin_border

ws1.column_dimensions['A'].width = 10
ws1.column_dimensions['B'].width = 58
ws1.column_dimensions['C'].width = 14
ws1.column_dimensions['D'].width = 12
ws1.column_dimensions['E'].width = 12
ws1.column_dimensions['F'].width = 9
ws1.column_dimensions['G'].width = 10
ws1.column_dimensions['H'].width = 8

# ============================================================
# ONGLET 2 : CHARGES COMPLEMENTAIRES (COMPARATIF)
# ============================================================
ws2 = wb.create_sheet("Charges Complementaires IA")

ws2.merge_cells('A1:G1')
ws2['A1'] = 'CCIS Yard View - Charges Complementaires avec assistance IA'
ws2['A1'].font = title_font
ws2['A1'].alignment = Alignment(horizontal='center', vertical='center')
ws2.row_dimensions[1].height = 30

headers2 = ['ID', 'Activite', 'Description / Impact IA', 'Sans IA (JH)', 'Avec IA (JH)', 'Gain (%)', 'Justification']
for i, h in enumerate(headers2, 1):
    ws2.cell(row=3, column=i, value=h)
style_header(ws2, 3, 7)

charges = [
    ('CC-01', 'Gestion de projet', 'Pilotage, suivi, coordination, reporting, COPIL', 12, 11, '8%', 'Reporting assiste, pilotage reste humain'),
    ('CC-02', 'Specs fonctionnelles', 'User stories, criteres acceptation, diagrammes', 6, 4, '33%', 'Redaction user stories assistee par IA'),
    ('CC-03', 'Specs techniques', 'Architecture, API design, diagrammes UML', 4, 2.5, '38%', 'Generation diagrammes et specs assistee'),
    ('CC-04', 'UX/UI Design', 'Maquettes Figma, prototypage, charte graphique', 8, 7, '13%', 'Outils IA emergents, validation humaine requise'),
    ('CC-05', 'Recette / QA', 'Plan de tests, campagnes recette, PV', 6, 4.5, '25%', 'Scenarios generes par IA, execution humaine'),
    ('CC-06', 'Documentation technique', 'Architecture, Swagger/OpenAPI, runbook', 3, 1.5, '50%', 'Generation auto Swagger, README, commentaires'),
    ('CC-07', 'Documentation utilisateur', 'Guide utilisateur, FAQ, aide contextuelle', 3, 2, '33%', 'Redaction assistee, validation metier humaine'),
    ('CC-08', 'Formation utilisateurs', 'Supports, sessions formation operateurs/managers', 2, 2, '0%', '100% humain - interaction directe requise'),
    ('CC-09', 'Deploiement & DevOps', 'Infra prod, monitoring, CI/CD, backup', 5, 3.5, '30%', 'Scripts IaC generes, config Docker assistee'),
    ('CC-10', 'Support post-livraison', 'Garantie 1 mois, anomalies, transfert competences', 5, 4, '20%', 'Diagnostic assiste, resolution plus rapide'),
]

for i, c in enumerate(charges):
    r = 4 + i
    for j, val in enumerate(c, 1):
        ws2.cell(row=r, column=j, value=val)
    style_row(ws2, r, 7)
    pct = int(c[5].replace('%', ''))
    ws2.cell(row=r, column=6).fill = gain_fill(pct) if pct > 0 else PatternFill(start_color='F2F2F2', end_color='F2F2F2', fill_type='solid')

# Total complementaires
r = 4 + len(charges) + 1
ws2.merge_cells(start_row=r, start_column=1, end_row=r, end_column=3)
ws2.cell(row=r, column=1, value='TOTAL CHARGES COMPLEMENTAIRES')
ws2.cell(row=r, column=4, value=54)
ws2.cell(row=r, column=5, value=42)
ws2.cell(row=r, column=6, value='22%')
for c_idx in range(1, 8):
    cell = ws2.cell(row=r, column=c_idx)
    cell.font = total_font
    cell.fill = total_fill
    cell.alignment = center
    cell.border = thin_border

# Recap total projet
r += 2
ws2.merge_cells(start_row=r, start_column=1, end_row=r, end_column=3)
ws2.cell(row=r, column=1, value='TOTAL PROJET SANS IA')
ws2.cell(row=r, column=4, value=159.5)
for c_idx in range(1, 8):
    cell = ws2.cell(row=r, column=c_idx)
    cell.font = Font(name='Calibri', bold=True, size=11)
    cell.fill = PatternFill(start_color='E2EFDA', end_color='E2EFDA', fill_type='solid')
    cell.alignment = center
    cell.border = thin_border

r += 1
ws2.merge_cells(start_row=r, start_column=1, end_row=r, end_column=3)
ws2.cell(row=r, column=1, value='TOTAL PROJET AVEC IA')
ws2.cell(row=r, column=5, value=103.375)
ws2.cell(row=r, column=6, value='35%')
for c_idx in range(1, 8):
    cell = ws2.cell(row=r, column=c_idx)
    cell.font = ia_accent_font
    cell.fill = ia_accent
    cell.alignment = center
    cell.border = thin_border

r += 1
ws2.merge_cells(start_row=r, start_column=1, end_row=r, end_column=3)
ws2.cell(row=r, column=1, value='ECONOMIE TOTALE PROJET')
ws2.cell(row=r, column=4, value='56.125 JH economises')
ws2.cell(row=r, column=6, value='35%')
for c_idx in range(1, 8):
    cell = ws2.cell(row=r, column=c_idx)
    cell.font = Font(name='Calibri', bold=True, size=12, color='006100')
    cell.fill = gain_high
    cell.alignment = center
    cell.border = thin_border

ws2.column_dimensions['A'].width = 10
ws2.column_dimensions['B'].width = 25
ws2.column_dimensions['C'].width = 55
ws2.column_dimensions['D'].width = 14
ws2.column_dimensions['E'].width = 14
ws2.column_dimensions['F'].width = 10
ws2.column_dimensions['G'].width = 45

# ============================================================
# ONGLET 3 : MACRO PLANNING IA
# ============================================================
ws3 = wb.create_sheet("Macro Planning IA")

ws3.merge_cells('A1:L1')
ws3['A1'] = 'CCIS Yard View - Macro Planning (Version Assistee IA)'
ws3['A1'].font = title_font
ws3['A1'].alignment = Alignment(horizontal='center', vertical='center')
ws3.row_dimensions[1].height = 30

ws3.merge_cells('A2:L2')
ws3['A2'] = 'Equipe: 2 devs assistes IA (Claude/Cursor) + 1 CP partiel | Sprint: 2 semaines | Duree: 14 semaines (~3.5 mois)'
ws3['A2'].font = Font(name='Calibri', italic=True, size=10, color='7030A0')
ws3['A2'].alignment = Alignment(horizontal='center')

# Comparative summary
ws3.merge_cells('A3:F3')
ws3['A3'] = 'Gain planning vs sans IA: -6 semaines (-30%) | 7 sprints au lieu de 10'
ws3['A3'].font = Font(name='Calibri', bold=True, size=10, color='006100')
ws3['A3'].fill = gain_high
ws3['A3'].alignment = Alignment(horizontal='center')

plan_headers = ['Sprint', 'Duree', 'Semaines', 'Epics / Activites', 'Charge (JH)', 'Jalon',
                'S1-S2', 'S3-S4', 'S5-S6', 'S7-S8', 'S9-S10', 'S11-S12', 'S13-S14']
for i, h in enumerate(plan_headers, 1):
    ws3.cell(row=5, column=i, value=h)
style_header(ws3, 5, len(plan_headers))

sprint_fill_ia = PatternFill(start_color='D9B3FF', end_color='D9B3FF', fill_type='solid')  # purple tint
jalon_fill = PatternFill(start_color='FFC000', end_color='FFC000', fill_type='solid')

sprints = [
    ('Sprint 0', '2 sem.', 'S1-S2', 'Cadrage: Specs fonctionnelles + UX/UI Design', 13.5,
     'J1: Cadrage valide', 0),
    ('Sprint 1', '2 sem.', 'S3-S4', 'E1 (Infrastructure) + E2 (Grille Yard) + E10 (UX)',  12.0,
     'J2: Env. pret', 1),
    ('Sprint 2', '2 sem.', 'S5-S6', 'E3 (Drag & Drop) + E4 (Conteneurs) + E9 (Historique)', 10.75,
     '', 2),
    ('Sprint 3', '2 sem.', 'S7-S8', 'E5 (Mouvements) + E6 (Zones)', 10.625,
     'J3: MVP Core', 3),
    ('Sprint 4', '2 sem.', 'S9-S10', 'E7 (Reefer) + E8 (Dashboard)', 9.875,
     'J4: Features completes', 4),
    ('Sprint 5', '2 sem.', 'S11-S12', 'E11 (Backend & Integration CargoWise & WebSocket)', 9.125,
     'J5: Backend integre', 5),
    ('Sprint 6', '2 sem.', 'S13-S14', 'E12 (Tests & Qualite) + Recette + Deploiement + Formation', 13.5,
     'J6: Mise en production', 6),
]

for i, s in enumerate(sprints):
    r = 6 + i
    ws3.cell(row=r, column=1, value=s[0])
    ws3.cell(row=r, column=2, value=s[1])
    ws3.cell(row=r, column=3, value=s[2])
    ws3.cell(row=r, column=4, value=s[3])
    ws3.cell(row=r, column=5, value=s[4])
    ws3.cell(row=r, column=6, value=s[5])
    style_row(ws3, r, len(plan_headers))

    gantt_col = 7 + s[6]
    cell = ws3.cell(row=r, column=gantt_col)
    cell.fill = sprint_fill_ia
    cell.value = f'{s[4]} JH'
    cell.font = Font(name='Calibri', bold=True, size=9, color='4A0082')

    if s[5]:
        cell.fill = jalon_fill
        cell.value = s[5].split(':')[0]
        cell.font = Font(name='Calibri', bold=True, size=9, color='C00000')

# Total
r = 6 + len(sprints) + 1
ws3.merge_cells(start_row=r, start_column=1, end_row=r, end_column=4)
ws3.cell(row=r, column=1, value='TOTAL PROJET (avec IA)')
ws3.cell(row=r, column=5, value=79.375)
for c_idx in range(1, len(plan_headers) + 1):
    cell = ws3.cell(row=r, column=c_idx)
    cell.font = ia_accent_font
    cell.fill = ia_accent
    cell.alignment = center
    cell.border = thin_border

# Comparison table
r += 2
ws3.merge_cells(start_row=r, start_column=1, end_row=r, end_column=6)
ws3.cell(row=r, column=1, value='COMPARAISON PLANNING : SANS IA vs AVEC IA')
ws3.cell(row=r, column=1).font = Font(name='Calibri', bold=True, size=12, color='2F5496')
r += 1

comp_headers = ['Indicateur', 'Sans IA', 'Avec IA', 'Ecart', 'Gain (%)']
for i, h in enumerate(comp_headers, 1):
    ws3.cell(row=r, column=i, value=h)
style_header(ws3, r, 5)

comparisons = [
    ('Nombre de sprints', '10', '7', '-3 sprints', '30%'),
    ('Duree projet', '20 semaines', '14 semaines', '-6 semaines', '30%'),
    ('Duree projet (mois)', '~5 mois', '~3.5 mois', '-1.5 mois', '30%'),
    ('Charge dev (JH)', '105.5', '61.375', '-44.125 JH', '42%'),
    ('Charge complementaire (JH)', '54', '42', '-12 JH', '22%'),
    ('Charge totale projet (JH)', '159.5', '103.375', '-56.125 JH', '35%'),
    ('Nb jalons', '6', '6', '0', 'Identique'),
]

for comp in comparisons:
    r += 1
    for i, val in enumerate(comp, 1):
        ws3.cell(row=r, column=i, value=val)
    style_row(ws3, r, 5)
    ws3.cell(row=r, column=5).fill = gain_high if comp[4] not in ('Identique', '0%') else PatternFill(start_color='F2F2F2', end_color='F2F2F2', fill_type='solid')

# Jalons
r += 2
ws3.merge_cells(start_row=r, start_column=1, end_row=r, end_column=6)
ws3.cell(row=r, column=1, value='JALONS DU PROJET (Version IA)')
ws3.cell(row=r, column=1).font = Font(name='Calibri', bold=True, size=12, color='2F5496')
r += 1

jalon_headers = ['Jalon', 'Intitule', 'Echeance IA', 'Echeance sans IA', 'Gain', 'Critere de validation']
for i, h in enumerate(jalon_headers, 1):
    ws3.cell(row=r, column=i, value=h)
style_header(ws3, r, 6)

jalons = [
    ('J1', 'Cadrage valide', 'Fin S2', 'Fin S2', '-', 'Specs et maquettes validees par le client'),
    ('J2', 'Environnement pret', 'Fin S4', 'Fin S4', '-', 'Infra, CI/CD, auth, BDD operationnels'),
    ('J3', 'MVP Core', 'Fin S8', 'Fin S8', '-', 'Grille, drag & drop, conteneurs, mouvements, zones'),
    ('J4', 'Features completes', 'Fin S10', 'Fin S12', '-2 sem.', 'Reefer, dashboard, toutes features metier'),
    ('J5', 'Backend integre', 'Fin S12', 'Fin S16', '-4 sem.', 'API REST, WebSocket, CargoWise operationnels'),
    ('J6', 'Mise en production', 'Fin S14', 'Fin S20', '-6 sem.', 'Application deployee, testee, documentee, equipe formee'),
]

for j in jalons:
    r += 1
    for i, val in enumerate(j, 1):
        ws3.cell(row=r, column=i, value=val)
    style_row(ws3, r, 6)
    ws3.cell(row=r, column=1).fill = jalon_fill
    ws3.cell(row=r, column=1).font = Font(name='Calibri', bold=True)
    if j[4] != '-':
        ws3.cell(row=r, column=5).fill = gain_high
        ws3.cell(row=r, column=5).font = Font(name='Calibri', bold=True, color='006100')

ws3.column_dimensions['A'].width = 14
ws3.column_dimensions['B'].width = 10
ws3.column_dimensions['C'].width = 12
ws3.column_dimensions['D'].width = 62
ws3.column_dimensions['E'].width = 14
ws3.column_dimensions['F'].width = 28
for col_idx in range(7, 14):
    ws3.column_dimensions[get_column_letter(col_idx)].width = 12

# ============================================================
# SAVE
# ============================================================
output = 'E:/projects/CCIS/ccis-yard-view/CCIS_YardView_Backlog_IA.xlsx'
wb.save(output)
print(f'Excel IA genere: {output}')
