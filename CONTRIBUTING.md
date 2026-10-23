# Cómo trabajamos en xARGOS

Flujo común para backend y frontend. La CI y las reglas de rama lo hacen cumplir; este documento explica el porqué y los comandos.

## Fase 1 · Tarea

1. Cada tarea es una **issue de GitHub** de un día como máximo. Su número (`#12`) es el identificador en ramas, commits y PR.
2. Se mueve en el tablero de **GitHub Projects**:
   `Todo` → `In progress` (al crear la rama) → `In review` (al abrir la PR) → `Done` (al mergear).
3. Si la tarea crece de un día, se parte en varias issues.

## Fase 2 · Entorno local

Al empezar la jornada, después de cambiar de rama y después de cada `git pull`:

```bash
bash scripts/prepare-env.sh   # Node 22, pnpm, dependencias, hooks, build del programa si hay Anchor
```

Para arrancar:

```bash
pnpm dev                      # cuando existan apps/web y services/api
```

## Fase 3 · Ramas

### Nombre

```
<tipo>/<issue>-<area>-<descripcion-corta>
```

| Parte               | Valores                                                                                                                                                      |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `tipo`              | `feat` (funcionalidad) · `fix` (arreglo) · `spike` (prueba técnica que puede tirarse) · `chore` (configuración, herramientas) · `docs` · `test` · `refactor` |
| `issue`             | número de la issue                                                                                                                                           |
| `area`              | `api` · `web` · `guard` · `shared` · `scripts` · `repo`                                                                                                      |
| `descripcion-corta` | minúsculas, palabras con guiones, máx. ~5 palabras                                                                                                           |

Ejemplos: `spike/8-api-x402-devnet` · `feat/14-guard-snapshot-assert` · `feat/15-web-demo-state-machine` · `fix/31-web-guard-message` · `chore/2-repo-bootstrap`.

La CI rechaza una PR cuya rama no cumpla el formato.

### Caso A: rama nueva (siempre desde `develop` actualizado)

```bash
git switch develop
git pull origin develop
git switch -c feat/14-guard-snapshot-assert
```

### Caso B: volver a una rama existente

```bash
git switch feat/14-guard-snapshot-assert
```

### Traer lo último de `develop` a tu rama

Usamos **rebase** (no merge), para que la rama quede lineal y se pueda integrar con "Rebase and merge":

```bash
git fetch origin
git rebase --autostash origin/develop     # --autostash guarda y recupera tus cambios sin commitear
# si ya habías subido la rama:
git push --force-with-lease
```

`--force-with-lease` solo sobre **tu** rama de feature. Nunca `--force` y nunca sobre `develop` o `main`.

## Fase 4 · Desarrollo y commits por micro-hito

- Antes de empezar, divide la tarea en **3–6 micro-hitos**. Cada uno es un trozo que compila y tiene su test (≈ cada 15–30 % de la tarea).
- **Un commit por micro-hito**, nunca un megacommit al final:

  ```bash
  git status
  git add <solo los archivos de este micro-hito>
  git commit -m "feat(guard): add snapshot instruction with slot check"
  ```
- Formato del mensaje: `tipo(area): qué se hizo`, en inglés, imperativo, ≤72 caracteres. El hook lo rechaza si no cumple.
- Los commits se quedan en local mientras trabajas. **Se sube la rama cuando la tarea está terminada** (o al final del día, como copia de seguridad: subir una rama no afecta a nadie).
- **Cambios on-chain** (deploy del programa, ALT, pool, mints): no van en el código de la PR, se ejecutan con `scripts/` y se apuntan en la sección "Cambios on-chain" de la PR, con sus firmas. Es el equivalente a dejar preparados los scripts SQL para el despliegue.

## Fase 5 · Subida y PR

1. Comprobación previa (lo mismo que hará la CI):

   ```bash
   pnpm check            # lint + typecheck + test
   ```
2. Subir la rama. **Nunca `--no-verify`**: los hooks son la primera barrera contra secretos.

   ```bash
   git push -u origin feat/14-guard-snapshot-assert   # primer push
   git push                                           # siguientes
   ```
3. Abrir la PR contra `develop` rellenando la plantilla:

   ```bash
   gh pr create --base develop --fill-first --web
   ```

   - Título: igual que un commit (`feat(guard): snapshot and assert_min_delta instructions`).
   - Cuerpo: `Closes #14` para que la issue se cierre al mergear.
4. Mover la issue a `In review` y avisar al otro en el chat del proyecto con el enlace.

## Fase 6 · Despliegue de pruebas (automático)

| Cuándo                       | Qué se despliega                 | Dónde                                   |
| ---------------------------- | -------------------------------- | --------------------------------------- |
| Al abrir o actualizar una PR | Preview del front                | Netlify, enlace en la propia PR         |
| Al mergear en `develop`      | Staging                          | Netlify (`develop`) + Railway (staging) |
| Al mergear en `main`         | Producción (lo que ve el jurado) | Netlify (prod) + Railway (prod)         |

No hay nada que lanzar a mano, salvo los cambios on-chain de la fase 4.

## Fase 7 · Revisión cruzada

- **Billy revisa las PRs de Leandro y Leandro las de Billy.** Sin aprobación del otro no se puede mergear (regla de rama).
- Quien revisa comprueba: CI en verde · el cambio hace lo que dice la issue · tests del cambio · preview o firmas de devnet si aplica · sin secretos · README actualizado si entra código de fuera.
- Plazo: **24 h** (12 h la última semana). Se puede aprobar, pedir cambios o comentar.
- **Si piden cambios:** se arreglan en la **misma rama**, nuevo commit y `git push`. La PR se actualiza sola.
- **Al aprobar:** quien abrió la PR mergea con **Rebase and merge** y borra la rama.
- **Después:**

  ```bash
  git switch develop
  git pull origin develop
  git branch -d feat/14-guard-snapshot-assert
  ```

## Si algo falla ya mergeado en `develop`

Nueva issue → rama `fix/<issue>-<area>-<desc>` desde `develop` → mismo ciclo.

## Promoción a `main`

En los hitos (1 nov y 8 nov) o con una mejora estable: smoke test en staging (checklist de la plantilla de PR), PR `develop → main` aprobada por el otro, **merge commit** y tag (`v0.1.0`, `v1.0.0`).

## Lo que nunca se hace

- Push directo a `develop` o `main`.
- `--no-verify`, `--force` o reescribir la historia de ramas compartidas.
- Commitear `.env`, keypairs o URLs con credenciales.
- Mezclar varias tareas en una PR.
