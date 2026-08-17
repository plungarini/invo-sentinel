import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
	// required to import modules from ../src, outside Next's app root
	experimental: {
		externalDir: true,
		// daemon sources use NodeNext-style ".js" specifiers for ".ts" files; webpack needs this to resolve them
		extensionAlias: { ".js": [".ts", ".tsx", ".js"] },
	},
	// better-sqlite3 is a native addon (a compiled .node binary) - it must
	// be require()'d at runtime, not bundled by webpack, or the build tries
	// to parse the binary as JS.
	serverExternalPackages: ["better-sqlite3"],
	// repo root has its own lockfile; without this Next misdetects the workspace root
	outputFileTracingRoot: path.join(import.meta.dirname, ".."),
	// the dev-only build-activity icon has no place in this project's own screenshots/docs
	devIndicators: false,
};

export default nextConfig;
