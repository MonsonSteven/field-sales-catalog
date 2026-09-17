// Resolver hook (runs on the module thread). See ts-resolve.mjs for why this exists.
export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context);
  } catch (err) {
    // Extensionless RELATIVE import (our source style) → retry as .ts, then /index.ts.
    const extensionless = /^\.{1,2}\//.test(specifier) && !/\.[cm]?[jt]sx?$/.test(specifier);
    if (extensionless) {
      for (const candidate of [`${specifier}.ts`, `${specifier}/index.ts`]) {
        try {
          return await nextResolve(candidate, context);
        } catch {
          /* try the next candidate */
        }
      }
    }
    throw err;
  }
}
