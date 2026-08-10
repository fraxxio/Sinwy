import { TanStackDevtools } from "@tanstack/react-devtools";
import type { QueryClient } from "@tanstack/react-query";
import {
	createRootRouteWithContext,
	HeadContent,
	Scripts,
	useMatches,
} from "@tanstack/react-router";
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools";
import UnfinishedOnboardingToast from "#/modules/user/components/UnfinishedOnboardingToast";
import Footer from "#/shared/components/Footer";
import Header from "#/shared/components/Header";
import { Toaster } from "#/shared/components/ui/toast";
import TanStackQueryDevtools from "#/shared/integrations/tanstack-query/devtools";
import appCss from "./styles.css?url";

interface MyRouterContext {
	queryClient: QueryClient;
}

const THEME_INIT_SCRIPT = `(function(){try{var stored=window.localStorage.getItem('theme');var mode=(stored==='light'||stored==='dark'||stored==='auto')?stored:'auto';var prefersDark=window.matchMedia('(prefers-color-scheme: dark)').matches;var resolved=mode==='auto'?(prefersDark?'dark':'light'):mode;var root=document.documentElement;root.classList.remove('light','dark');root.classList.add(resolved);if(mode==='auto'){root.removeAttribute('data-theme')}else{root.setAttribute('data-theme',mode)}root.style.colorScheme=resolved;}catch(e){}})();`;

export const Route = createRootRouteWithContext<MyRouterContext>()({
	head: () => ({
		meta: [
			{
				charSet: "utf-8",
			},
			{
				name: "viewport",
				content: "width=device-width, initial-scale=1",
			},
			{
				title: "Sinwy",
			},
		],
		links: [
			{
				rel: "stylesheet",
				href: appCss,
			},
		],
	}),
	shellComponent: RootDocument,
});

/**
 * Picks the shell for the active route: dashboard routes render their own app
 * shell, everything else gets the site header and footer.
 */
function RouteShell({ children }: { children: React.ReactNode }) {
	const hasOwnAppShell = useMatches({
		select: (matches) => matches.some((match) => match.staticData.appShell),
	});

	if (hasOwnAppShell) return children;

	return (
		<>
			<Header />
			{children}
			<Footer />
		</>
	);
}

function RootDocument({ children }: { children: React.ReactNode }) {
	return (
		<html lang="en" suppressHydrationWarning>
			<head>
				{/** biome-ignore lint/security/noDangerouslySetInnerHtml: false */}
				<script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
				<HeadContent />
			</head>
			<body
				className="font-sans antialiased wrap-anywhere selection:bg-[rgba(79,184,178,0.24)]"
				suppressHydrationWarning
			>
				<Toaster>
					<RouteShell>{children}</RouteShell>
					<UnfinishedOnboardingToast />
				</Toaster>
				<TanStackDevtools
					config={{
						position: "bottom-right",
					}}
					plugins={[
						{
							name: "Tanstack Router",
							render: <TanStackRouterDevtoolsPanel />,
						},
						TanStackQueryDevtools,
					]}
				/>
				<Scripts />
			</body>
		</html>
	);
}
