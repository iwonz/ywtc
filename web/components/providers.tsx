'use client';
import { MantineProvider } from '@mantine/core';
export function Providers({
	children,
	nonce,
}: {
	children: React.ReactNode;
	nonce?: string;
}) {
	return (
		<MantineProvider
			defaultColorScheme="auto"
			getStyleNonce={() => nonce ?? ''}
			theme={{
				primaryColor: 'cyan',
				defaultRadius: 'sm',
				fontFamily: 'Inter, system-ui, sans-serif',
			}}
		>
			{children}
		</MantineProvider>
	);
}
