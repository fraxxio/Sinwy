import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "#/shared/components/ui/button.tsx";

type Theme = "light" | "dark";

function applyTheme(theme: Theme) {
	const root = document.documentElement;
	root.classList.remove("light", "dark");
	root.classList.add(theme);
	root.setAttribute("data-theme", theme);
	root.style.colorScheme = theme;
}

export function useTheme() {
	const [theme, setTheme] = useState<Theme>("light");

	useEffect(() => {
		setTheme(
			document.documentElement.classList.contains("dark") ? "dark" : "light",
		);
	}, []);

	function toggleTheme() {
		const nextTheme: Theme = theme === "dark" ? "light" : "dark";
		setTheme(nextTheme);
		applyTheme(nextTheme);
		window.localStorage.setItem("theme", nextTheme);
	}

	return { theme, toggleTheme };
}

const ThemeToggle = () => {
	const { theme, toggleTheme } = useTheme();

	const label =
		theme === "dark" ? "Switch to light mode" : "Switch to dark mode";

	return (
		<Button
			variant="secondary"
			size="icon"
			onClick={toggleTheme}
			aria-label={label}
			title={label}
		>
			{theme === "dark" ? <Sun /> : <Moon />}
		</Button>
	);
};

export default ThemeToggle;
