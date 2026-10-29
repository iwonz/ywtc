import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { describe, it, expect } from "vitest";

async function sources(directory: string): Promise<string[]> {
	const entries = await readdir(directory, { withFileTypes: true });
	return (
		await Promise.all(
			entries
				.filter(
					(entry) =>
						!entry.name.startsWith(".") && entry.name !== "next-env.d.ts",
				)
				.map((entry) =>
					entry.isDirectory()
						? sources(path.join(directory, entry.name))
						: /\.(tsx?|css)$/.test(entry.name)
							? [path.join(directory, entry.name)]
							: [],
				),
		)
	).flat();
}
describe("shared operator component system", () => {
	it("uses shared local shadcn primitives and removes the previous frontend runtime", async () => {
		const pkg = JSON.parse(await readFile("package.json", "utf8"));
		expect(
			Object.keys({ ...pkg.dependencies, ...pkg.devDependencies }).filter(
				(name) => name.startsWith("@mantine/"),
			),
		).toEqual([]);
		for (const file of (
			await Promise.all(["web", "report-ui", "mentions-ui", "ui"].map(sources))
		).flat())
			expect(await readFile(file, "utf8"), file).not.toMatch(
				/@mantine\/|--mantine-|useMantine/,
			);
		for (const entry of [
			"web/components/control-center.tsx",
			"report-ui/src/App.tsx",
			"mentions-ui/src/main.tsx",
		])
			expect(await readFile(entry, "utf8")).toContain(
				"../../ui/components/button",
			);
	});
	it("compiles local tokens and all frontend source roots without external stylesheet imports", async () => {
		const styles = await readFile("ui/styles.css", "utf8");
		for (const root of [
			"../web/components",
			"../report-ui/src",
			"../mentions-ui/src",
		])
			expect(styles).toContain(`@source "${root}"`);
		expect(styles).toContain("@custom-variant dark");
		expect(styles).not.toMatch(/@import\s+["']https?:/);
		const registry = JSON.parse(await readFile("components.json", "utf8"));
		expect(registry.tailwind.css).toBe("ui/styles.css");
	});
});
