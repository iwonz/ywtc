import path from "node:path";
import { packRelease } from "./release-package.js";

async function main(): Promise<void> {
	const output = process.argv[2];
	if (!output)
		throw Error(
			"Usage: npm run package:pack -- <output-directory> (run npm run build first)",
		);
	process.stdout.write(await packRelease(process.cwd(), path.resolve(output)));
}

main().catch((error: unknown) => {
	process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
	process.exitCode = 1;
});
