#!/usr/bin/env bash
# Crea en GitHub todo lo necesario para trabajar los Sprints de SIDI:
# etiquetas, milestones, rama develop, issues (uno por historia + cierres) y el tablero Kanban (GitHub Projects).
# Es idempotente: si algo ya existe, lo omite. Ver context/Sprints.md para el paso a paso.
#
# Uso (Git Bash en Windows, desde la raíz del repositorio):
#   gh auth login                 # una sola vez
#   gh auth refresh -s project    # permiso para crear el tablero
#   bash scripts/github/crear-tablero.sh

set -euo pipefail

# ─────────────────────────── CONFIGURACIÓN ───────────────────────────
OWNER="CalixtoIsaac"
REPO="$OWNER/SIDI-Sistema-Integral-de-Informacion-Docente"
PROJECT_TITLE="SIDI · Tablero Scrum"

# Usuarios de GitHub del equipo (déjalos vacíos si aún no son colaboradores del repo;
# en ese caso los issues se crean sin asignar).
GH_UZIEL=""      # U · BD
GH_MATIAS=""     # M · Backend
GH_SEBASTIAN=""  # S · Frontend

# Fecha de fin (due date) de cada milestone = último día hábil del sprint.
SPRINT1_FIN="2026-11-09"
SPRINT2_FIN="2026-11-17"
SPRINT3_FIN="2026-11-24"

CREAR_DEVELOP="si"   # crea la rama develop desde main y la deja como rama por defecto
# ─────────────────────────────────────────────────────────────────────

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MANIFEST="$DIR/issues.tsv"
command -v gh >/dev/null || { echo "Falta GitHub CLI (gh): https://cli.github.com"; exit 1; }
gh auth status >/dev/null 2>&1 || { echo "Ejecuta primero: gh auth login"; exit 1; }

paso() { printf '\n\033[1;35m▶ %s\033[0m\n' "$1"; }

# 0. Archivos .github (CODEOWNERS y plantillas) ------------------------
RAIZ="$(cd "$DIR/../.." && pwd)"
if [[ ! -f "$RAIZ/.github/CODEOWNERS" ]]; then
  mkdir -p "$RAIZ/.github"
  cp -r "$DIR/dot-github/." "$RAIZ/.github/"
  echo "  ✓ Copiados a .github/: CODEOWNERS, pull_request_template.md, ISSUE_TEMPLATE/bug.yml (súbelos con un commit)"
fi

# 1. Etiquetas ---------------------------------------------------------
paso "1/6 Etiquetas"
etiqueta() { gh label create "$1" --color "$2" --description "$3" --force -R "$REPO" >/dev/null && echo "  ✓ $1"; }
etiqueta "tipo:historia" "DB2777" "Historia de usuario del backlog"
etiqueta "tipo:tarea"    "6B7280" "Tarea de integración, revisión o cierre"
etiqueta "tipo:bug"      "DC2626" "Error encontrado en pruebas"
etiqueta "prioridad:1"   "B91C1C" "Prioridad alta"
etiqueta "prioridad:2"   "D97706" "Prioridad media"
etiqueta "prioridad:3"   "65A30D" "Prioridad baja"
etiqueta "area:bd"       "1D4ED8" "Uziel · base de datos y estructura"
etiqueta "area:backend"  "0F766E" "Matías · backend"
etiqueta "area:frontend" "9333EA" "Sebastián · frontend"
etiqueta "EP-01" "FBCFE8" "Seguimiento y consulta de docentes"
etiqueta "EP-02" "FBCFE8" "Descuentos por inasistencias"
etiqueta "EP-03" "FBCFE8" "Activos, altas y bajas"
etiqueta "EP-04" "FBCFE8" "Gráficas y análisis"
etiqueta "EP-05" "FBCFE8" "Ranking OPINA"
etiqueta "EP-06" "FBCFE8" "Reportes quincenales de Nacional"
etiqueta "EP-07" "FBCFE8" "Color y modo claro/oscuro"

# 2. Milestones --------------------------------------------------------
paso "2/6 Milestones (uno por Sprint)"
milestone() {
  local titulo="$1" fin="$2" desc="$3"
  if gh api "repos/$REPO/milestones?state=all&per_page=100" --jq ".[] | select(.title==\"$titulo\") | .number" | grep -q .; then
    echo "  = $titulo ya existe"
  else
    gh api "repos/$REPO/milestones" -f title="$titulo" -f due_on="${fin}T23:59:59Z" -f description="$desc" >/dev/null
    echo "  ✓ $titulo (vence $fin)"
  fi
}
milestone "Sprint 1" "$SPRINT1_FIN" "Base, datos de entrada y consulta · 70 pts · días 1–5"
milestone "Sprint 2" "$SPRINT2_FIN" "Faltas, reportes de Nacional y analítica · 51 pts · días 6–10"
milestone "Sprint 3" "$SPRINT3_FIN" "Comparativo, correo y resumen ejecutivo · 13 pts · días 11–15"

# 3. Rama develop ------------------------------------------------------
paso "3/6 Rama develop"
if [[ "$CREAR_DEVELOP" == "si" ]]; then
  if gh api "repos/$REPO/branches/develop" >/dev/null 2>&1; then
    echo "  = develop ya existe"
  else
    SHA=$(gh api "repos/$REPO/git/ref/heads/main" --jq .object.sha)
    gh api "repos/$REPO/git/refs" -f ref=refs/heads/develop -f sha="$SHA" >/dev/null
    echo "  ✓ develop creada desde main"
  fi
  gh api -X PATCH "repos/$REPO" -f default_branch=develop >/dev/null
  echo "  ✓ develop es la rama por defecto (así \"Closes #N\" cierra el issue al fusionar a develop)"
fi

# 4. Tablero (GitHub Projects) ----------------------------------------
paso "4/6 Tablero Kanban"
NUM=$(gh project list --owner "$OWNER" --limit 100 --format json --jq ".projects[] | select(.title==\"$PROJECT_TITLE\") | .number")
if [[ -z "$NUM" ]]; then
  NUM=$(gh project create --owner "$OWNER" --title "$PROJECT_TITLE" --format json --jq .number)
  echo "  ✓ Proyecto #$NUM creado"
else
  echo "  = Proyecto #$NUM ya existe"
fi
gh project link "$NUM" --owner "$OWNER" --repo "$REPO" >/dev/null 2>&1 || true
PID=$(gh project view "$NUM" --owner "$OWNER" --format json --jq .id)

campo() {  # nombre tipo
  if ! gh project field-list "$NUM" --owner "$OWNER" --format json --jq ".fields[].name" | grep -qx "$1"; then
    gh project field-create "$NUM" --owner "$OWNER" --name "$1" --data-type "$2" >/dev/null
    echo "  ✓ Campo $1"
  fi
}
campo "Puntos" NUMBER
campo "Día" NUMBER
campo "Fecha" DATE
id_campo() { gh project field-list "$NUM" --owner "$OWNER" --format json --jq ".fields[] | select(.name==\"$1\") | .id"; }
F_PTS=$(id_campo "Puntos"); F_DIA=$(id_campo "Día"); F_FECHA=$(id_campo "Fecha")

# 5. Issues ------------------------------------------------------------
paso "5/6 Issues"
usuario() { case "$1" in U) echo "$GH_UZIEL";; M) echo "$GH_MATIAS";; S) echo "$GH_SEBASTIAN";; esac; }
EXISTENTES=$(gh issue list -R "$REPO" --state all --limit 500 --json title,url --jq '.[] | "\(.title)\t\(.url)"')

while IFS=$'\t' read -r -u 3 archivo titulo etiquetas milestone resp puntos dia fecha; do
  fecha="${fecha%$'\r'}"
  url=$(printf '%s\n' "$EXISTENTES" | awk -F'\t' -v t="$titulo" '$1==t {print $2}')
  if [[ -n "$url" ]]; then
    echo "  = $titulo"
  else
    asignar=()
    for r in $resp; do u=$(usuario "$r"); if [[ -n "$u" ]]; then asignar+=(--assignee "$u"); fi; done
    url=$(gh issue create -R "$REPO" --title "$titulo" --body-file "$DIR/issues/$archivo" \
          --label "$etiquetas" --milestone "$milestone" "${asignar[@]}")
    echo "  ✓ $titulo"
  fi
  item=$(gh project item-add "$NUM" --owner "$OWNER" --url "$url" --format json --jq .id)
  gh project item-edit --id "$item" --project-id "$PID" --field-id "$F_PTS"   --number "$puntos" >/dev/null
  gh project item-edit --id "$item" --project-id "$PID" --field-id "$F_DIA"   --number "$dia"    >/dev/null
  gh project item-edit --id "$item" --project-id "$PID" --field-id "$F_FECHA" --date   "$fecha"  >/dev/null
done 3< <(tail -n +2 "$MANIFEST")

# 6. Listo -------------------------------------------------------------
paso "6/6 Listo"
echo "  Tablero: https://github.com/users/$OWNER/projects/$NUM"
echo "  Falta (manual, ver Sprints.md §6–§8): columnas de Status, vistas, automatizaciones y protección de ramas."
