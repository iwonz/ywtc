import { NextResponse, type NextRequest } from 'next/server';
export function proxy(request: NextRequest) {
	if (request.headers.get('host') !== `127.0.0.1:${process.env.PORT}`)
		return new NextResponse('Invalid local Host', { status: 403 });
	const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
	const csp = `default-src 'self'; script-src 'self' 'nonce-${nonce}' 'strict-dynamic'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; frame-src 'self' blob:; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'`;
	const headers = new Headers(request.headers);
	headers.set('x-nonce', nonce);
	headers.set('Content-Security-Policy', csp);
	const response = NextResponse.next({ request: { headers } });
	response.headers.set('Content-Security-Policy', csp);
	response.headers.set('Referrer-Policy', 'no-referrer');
	response.headers.set('X-Content-Type-Options', 'nosniff');
	response.headers.set('Cache-Control', 'no-store');
	return response;
}
export const config = { matcher: ['/((?!_next/static|favicon.ico).*)'] };
