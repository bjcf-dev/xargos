#!/usr/bin/env bash
# Comprueba que Node cumple el suelo de seguridad (CLAUDE.md, regla 12).
# Uso:
#   bash scripts/check-node.sh            # sale con 1 si Node no es válido
#   bash scripts/check-node.sh --session  # hook de Claude Code: siempre sale con 0
set -uo pipefail

# Único sitio donde vive el mínimo. Fuente:
# https://nodejs.org/en/blog/vulnerability/october-2026-security-releases
NODE_MIN="22.23.4"

mode="${1:-}"

if ! command -v node >/dev/null 2>&1; then
  node_cur="(no instalado)"
  ok=0
else
  node_cur="$(node -p 'process.versions.node')"
  ok=1
  [ "${node_cur%%.*}" -eq 22 ] || ok=0
  [ "$(printf '%s\n%s\n' "$NODE_MIN" "$node_cur" | sort -V | head -n1)" = "$NODE_MIN" ] || ok=0
fi

if [ "$ok" -eq 1 ]; then
  [ "$mode" = "--session" ] || echo "Node v$node_cur OK (mínimo $NODE_MIN)"
  exit 0
fi

cat <<EOF
ALERTA DE SEGURIDAD: Node $node_cur no cumple el mínimo de xARGOS (22.x >= $NODE_MIN).
Las versiones anteriores tienen vulnerabilidades altas corregidas el 21 oct 2026
(DNS, validación TLS de hostnames y descompresión Brotli).

INSTRUCCIONES PARA CLAUDE CODE (hazlas en este orden, sin saltarte ninguna):
1. No ejecutes pnpm, scripts ni tests hasta resolverlo.
2. Díselo al usuario en una línea: versión actual, versión mínima y el motivo.
3. Intenta dejarlo en la versión segura en tu propio shell:
     source ~/.nvm/nvm.sh && nvm install 22 && nvm use 22 && node --version
   Ese cambio solo vale para tus comandos, no para la terminal del usuario.
4. Si no puedes (no hay nvm, falla la descarga, no hay permisos) o aunque lo logres,
   dale al usuario SOLO estos pasos, tal cual:
     a) Cierra esta sesión de Claude (Ctrl+C dos veces o /exit).
     b) En la terminal ejecuta:
          nvm install 22 && nvm use 22
          node --version      # debe mostrar v22.23.4 o superior
     c) Si dice "nvm: command not found", instala nvm desde https://github.com/nvm-sh/nvm
        y abre una terminal nueva; o instala Node 22 LTS desde https://nodejs.org
     d) Desde ESA misma terminal: cd al repo, bash scripts/prepare-env.sh y vuelve a abrir claude.
5. Para y espera a que el usuario confirme. No sigas trabajando con un Node vulnerable.
EOF

[ "$mode" = "--session" ] && exit 0
exit 1
