import pkg from '../package.json' with { type: 'json' };

/** Baked in at build time via a static JSON import (works under tsx, bun build --compile, and plain node) - not read from disk at runtime, since a compiled binary doesn't ship package.json. */
export const APP_VERSION: string = pkg.version;
