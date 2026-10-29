import path from 'node:path';
import { pathToFileURL } from 'node:url';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
async function handle(request: Request) {
	if (
		new URL(request.url).pathname === '/api/health' &&
		request.headers.get('host') === `127.0.0.1:${process.env.PORT}`
	)
		return Response.json({ ready: true });
	const filename = pathToFileURL(
		path.join(process.env.YWTC_UI_RUNTIME!, 'ui-service.js'),
	).href;
	const service = await import(/* webpackIgnore: true */ filename);
	return service.handleUiRequest(request);
}
export { handle as GET, handle as POST, handle as PUT };
