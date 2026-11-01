// Regenerates src/generated from idl/guard.json. Run after `anchor build`:
//   cp target/idl/guard.json packages/guard-client/idl/guard.json && pnpm --filter @xargos/guard-client generate
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { rootNodeFromAnchor } from "@codama/nodes-from-anchor";
import { renderVisitor } from "@codama/renderers-js";
import { createFromRoot, updateAccountsVisitor } from "codama";

const idl = JSON.parse(
  readFileSync(fileURLToPath(new URL("../idl/guard.json", import.meta.url)), "utf8"),
);
const codama = createFromRoot(rootNodeFromAnchor(idl));
// The instruction `snapshot` and the account `Snapshot` would both export SNAPSHOT_DISCRIMINATOR.
codama.update(updateAccountsVisitor({ snapshot: { name: "snapshotState" } }));
const out = fileURLToPath(new URL("..", import.meta.url));
await codama.accept(renderVisitor(out, { syncPackageJson: false, formatCode: false }));
console.log(`Generated guard client in ${out}`);
