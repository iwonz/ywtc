import "./style.css";
import { Providers } from "../components/providers";
export const metadata = {
	title: "ywtc · Control center",
	description: "Local migration control center",
};
export const dynamic = "force-dynamic";
export default async function Layout({
	children,
}: {
	children: React.ReactNode;
}) {
	return (
		<html lang="ru" suppressHydrationWarning>
			<body>
				<Providers>{children}</Providers>
			</body>
		</html>
	);
}
