export async function api(
	route: string,
	method = 'GET',
	body?: unknown,
): Promise<any> {
	const response = await fetch(`/api/${route}`, {
		method,
		headers: { 'content-type': 'application/json' },
		...(body === undefined ? {} : { body: JSON.stringify(body) }),
	});
	const data = await response.json();
	if (!response.ok) throw new Error(data.error ?? `HTTP ${response.status}`);
	return data;
}
export function safeLink(value: unknown): string | undefined {
	if (typeof value !== 'string') return;
	try {
		const url = new URL(value);
		if (
			['http:', 'https:'].includes(url.protocol) &&
			!url.username &&
			!url.password
		)
			return url.href;
	} catch {}
	return;
}
export function download(value: unknown, filename: string) {
	const url = URL.createObjectURL(
		new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }),
	);
	const a = document.createElement('a');
	a.href = url;
	a.download = filename;
	a.click();
	setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export type Translate = (ru: string, en: string) => string;
export const statusColor = (status: string) =>
	status === 'complete' || status === 'completed'
		? 'teal'
		: ['failed', 'conflict'].includes(status)
			? 'red'
			: ['partial', 'blocked', 'interrupted'].includes(status)
				? 'orange'
				: 'gray';
