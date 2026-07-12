import babel from "@rolldown/plugin-babel";
import tailwindcss from "@tailwindcss/vite";
import { devtools } from "@tanstack/devtools-vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact, { reactCompilerPreset } from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const config = defineConfig({
	resolve: { tsconfigPaths: true },
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
