// Regenerates the Kit client in src/generated from the Anchor IDL.
// Run after `anchor build`: pnpm codama
import { readFileSync } from 'node:fs';
import { rootNodeFromAnchor } from '@codama/nodes-from-anchor';
import { renderVisitor } from '@codama/renderers-js';
import { createFromRoot } from 'codama';

const idl = JSON.parse(readFileSync(new URL('../../target/idl/last_batch.json', import.meta.url), 'utf8'));
const codama = createFromRoot(rootNodeFromAnchor(idl));
await codama.accept(renderVisitor('.', { syncPackageJson: false, erasableSyntax: true }));
