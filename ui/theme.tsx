"use client";
import {
	createContext,
	useContext,
	useEffect,
	useState,
	type ReactNode,
} from "react";
type Theme = "system" | "light" | "dark";
const ThemeContext = createContext<{
	theme: Theme;
	setTheme: (value: Theme) => void;
}>({ theme: "system", setTheme: () => {} });
export function ThemeProvider({ children }: { children: ReactNode }) {
	const [theme, setCurrentTheme] = useState<Theme>("system");
	useEffect(() => {
		try {
			const saved =
				localStorage.getItem("ywtc-ui-theme") ??
				localStorage.getItem("mantine-color-scheme-value");
			if (saved === "dark" || saved === "light") setCurrentTheme(saved);
		} catch {}
	}, []);
	useEffect(() => {
		const media = matchMedia("(prefers-color-scheme: dark)");
		const apply = () => {
			const dark = theme === "dark" || (theme === "system" && media.matches);
			document.documentElement.classList.toggle("dark", dark);
			document.documentElement.classList.toggle("light", !dark);
		};
		apply();
		media.addEventListener("change", apply);
		return () => media.removeEventListener("change", apply);
	}, [theme]);
	const setTheme = (value: Theme) => {
		setCurrentTheme(value);
		try {
			localStorage.setItem("ywtc-ui-theme", value);
		} catch {}
	};
	return (
		<ThemeContext.Provider value={{ theme, setTheme }}>
			{children}
		</ThemeContext.Provider>
	);
}
export function useUiTheme() {
	return useContext(ThemeContext);
}
