// Zero-dependency test setup. Node 24 runs TypeScript natively (type stripping), but its
// ESM resolver demands explicit file extensions, while our source uses Next/bundler-style
// extensionless relative imports (`./helpers`). This hook retries a failed relative
// specifier with `.ts`, so `node --test` can import the real lib files with NO build step,
// NO transpiler, and NO added dependency (keeping the security-first, dep-light posture).
//
// Only `@/…` TYPE imports appear in the modules under test, and type-only imports are
// erased by type stripping — so no tsconfig path-alias resolution is needed here.
import { register } from "node:module";

// Pass the URL straight through — building a path from it breaks on Windows drive letters
// and re-encodes the spaces in "Claude Code" / "Vanity Art Catalog".
register(new URL("./ts-resolve-hooks.mjs", import.meta.url));
