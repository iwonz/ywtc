import Image from "next/image";
import type { ReactNode } from "react";

export function EmptyState({
	kind,
	title,
	description,
	children,
}: {
	kind: "connections" | "reports" | "tasks" | "sync" | "decisions";
	title: string;
	description: string;
	children?: ReactNode;
}) {
	return (
		<section className="empty-state" data-empty-state={kind} aria-label={title}>
			<Image
				unoptimized
				src={`/illustrations/${kind}.png`}
				width={1536}
				height={1024}
				alt=""
				aria-hidden="true"
				className="empty-state-art"
			/>
			<h3>{title}</h3>
			<p>{description}</p>
			{children && <div className="empty-state-actions">{children}</div>}
		</section>
	);
}
