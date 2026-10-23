// Deploy config for the cf CLI. Secrets are set with `cf deploy --secrets-file`, never committed:
// MUBIT_API_KEY (the Mubit key) and STYLIST_TOKEN (the stylist's inbox key).
import { bindings, defineConfig, exports } from "cf/config";

export default defineConfig({
	worker: {
		name: "brief-builder",
		compatibilityDate: "2025-09-02",
		compatibilityFlags: ["nodejs_compat"],
		entrypoint: "src/server.ts",
		observability: { enabled: true },
		env: {
			// One live room per stylist: their DMs, briefs and corrections, and the screens' WebSockets.
			ROOMS: bindings.durableObject({ worker: "brief-builder", exportName: "StylistRoom" }),
			MUBIT_API_KEY: bindings.secret(),
			STYLIST_TOKEN: bindings.secret(),
		},
		exports: {
			StylistRoom: exports.durableObject({ storage: "sqlite" }),
		},
	},
});
