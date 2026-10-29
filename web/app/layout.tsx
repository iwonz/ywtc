import '@mantine/core/styles.css';
import './style.css';
import { ColorSchemeScript, mantineHtmlProps } from '@mantine/core';
import { headers } from 'next/headers';
import { Providers } from '../components/providers';
export const metadata = {
	title: 'ywtc · Control center',
	description: 'Local migration control center',
};
export const dynamic = 'force-dynamic';
export default async function Layout({
	children,
}: {
	children: React.ReactNode;
}) {
	const nonce = (await headers()).get('x-nonce') ?? undefined;
	return (
		<html lang="ru" {...mantineHtmlProps}>
			<head>
				<ColorSchemeScript nonce={nonce} defaultColorScheme="auto" />
			</head>
			<body>
				<Providers nonce={nonce}>{children}</Providers>
			</body>
		</html>
	);
}
