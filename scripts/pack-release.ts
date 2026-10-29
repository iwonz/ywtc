import path from "node:path";
import { packRelease } from "./release-package.js";
const output = process.argv[2];
if (!output)
	throw Error(
		"Usage: npm run package:pack -- <output-directory> (run npm run build first)",
	);
process.stdout.write(await packRelease(process.cwd(), path.resolve(output)));
