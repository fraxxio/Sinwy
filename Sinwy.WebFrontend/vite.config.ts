import babel from "@rolldown/plugin-babel";
import tailwindcss from "@tailwindcss/vite";
import { devtools } from "@tanstack/devtools-vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact, { reactCompilerPreset } from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import appConfig from "./src/shared/lib/appConfig";

const config = defineConfig({
	resolve: { tsconfigPaths: true },
	server: {
		// ponytail: dev proxy keeps auth cookies same-origin; set BACKEND_URL if the backend isn't on :3001
		proxy: { "/api": appConfig.BACKEND_URL },
	},
	plugins: [
		devtools(),
		tailwindcss(),
		tanstackStart({
			router: {
				// relative to srcDirectory ("src"), so this is ./src
				routesDirectory: ".",
				virtualRouteConfig: "./src/routes.ts",
			},
		}),
		viteReact(),
		babel({ presets: [reactCompilerPreset()] }),
	],
});

export default config;
