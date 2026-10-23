#!/usr/bin/env bash
# Prepara el entorno local de xARGOS.
# Ejecutar al empezar la jornada, tras cambiar de rama y tras cada git pull.
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

echo "==> Node"
node_major="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$node_major" -lt 22 ]; then
  echo "Se necesita Node 22 o superior (tienes $(node --version))." >&2
  exit 1
fi
node --version

echo "==> pnpm (vía corepack)"
corepack enable >/dev/null 2>&1 || true
pnpm --version

echo "==> Dependencias"
pnpm install --frozen-lockfile

echo "==> Hooks de git"
pnpm exec lefthook install

echo "==> gitleaks"
if command -v gitleaks >/dev/null 2>&1; then
  gitleaks version
else
  echo "AVISO: gitleaks no está instalado. Instálalo: https://github.com/gitleaks/gitleaks" >&2
fi

echo "==> .env"
if [ ! -f .env ]; then
  echo "AVISO: no hay .env. Copia .env.example a .env y rellénalo (el modo mock del front no lo necesita)." >&2
fi
if ! git check-ignore -q .env; then
  echo "ERROR: .env no está ignorado por git." >&2
  exit 1
fi

if [ -f Anchor.toml ]; then
  echo "==> Programa guard"
  if command -v anchor >/dev/null 2>&1; then
    anchor build
  else
    echo "AVISO: hay Anchor.toml pero no tienes anchor instalado (solo lo necesita el backend)." >&2
  fi
fi

echo "==> Listo"
