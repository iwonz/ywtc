"use client";
import * as React from "react";
import {
	Check,
	ChevronsUpDown,
	Eye,
	EyeOff,
	LoaderCircle,
	X,
} from "lucide-react";
import { Collapsible as CollapsiblePrimitive } from "radix-ui";
import { cn } from "./lib/utils";
import { Button } from "./components/button";
import { Input } from "./components/input";
import { Label } from "./components/label";
import { Checkbox } from "./components/checkbox";
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "./components/dialog";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "./components/select";
import { Popover, PopoverContent, PopoverTrigger } from "./components/popover";
import {
	Command,
	CommandEmpty,
	CommandInput,
	CommandItem,
	CommandList,
} from "./components/command";
import { RadioGroup, RadioGroupItem } from "./components/radio-group";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "./components/tooltip";
import { Alert, AlertTitle, AlertDescription } from "./components/alert";
import {
	Pagination,
	PaginationContent,
	PaginationItem,
	PaginationPrevious,
	PaginationNext,
	PaginationLink,
} from "./components/pagination";
type FieldMeta = {
	label?: React.ReactNode;
	description?: React.ReactNode;
	error?: React.ReactNode;
	leading?: React.ReactNode;
	className?: string | undefined;
};
export function InputField({
	label,
	description,
	error,
	leading,
	className,
	id,
	...props
}: React.ComponentProps<typeof Input> & FieldMeta) {
	const generated = React.useId(),
		fieldId = id ?? generated;
	return (
		<div className={cn("ui-field", className)}>
			{label && <Label htmlFor={fieldId}>{label}</Label>}
			<div className="relative">
				{leading && (
					<span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground">
						{leading}
					</span>
				)}
				<Input
					{...props}
					id={fieldId}
					className={leading ? "pl-9" : undefined}
					aria-invalid={Boolean(error)}
					aria-describedby={
						error || description ? `${fieldId}-hint` : undefined
					}
				/>
			</div>
			{(error || description) && (
				<p
					id={`${fieldId}-hint`}
					className={error ? "ui-field-error" : "ui-field-hint"}
				>
					{error || description}
				</p>
			)}
		</div>
	);
}
export function PasswordField(
	props: React.ComponentProps<typeof Input> & FieldMeta,
) {
	const [visible, setVisible] = React.useState(false);
	return (
		<div className="relative">
			<InputField {...props} type={visible ? "text" : "password"} />
			<Button
				type="button"
				variant="ghost"
				size="icon-sm"
				className="absolute bottom-0.5 right-1"
				aria-label={visible ? "Hide password" : "Show password"}
				onClick={() => setVisible(!visible)}
			>
				{visible ? <EyeOff /> : <Eye />}
			</Button>
		</div>
	);
}
export function NumberField({
	onValueChange,
	...props
}: Omit<React.ComponentProps<typeof InputField>, "onChange" | "type"> & {
	onValueChange: (value: number | string) => void;
}) {
	return (
		<InputField
			{...props}
			type="number"
			onChange={(event) =>
				onValueChange(
					event.currentTarget.value === ""
						? ""
						: Number(event.currentTarget.value),
				)
			}
		/>
	);
}
type ChoiceOption =
	| string
	| {
			value: string;
			label: string;
			disabled?: boolean;
	  };
export function ChoiceField({
	options,
	label,
	description,
	value,
	onValueChange,
	searchable,
	clearable,
	placeholder,
	className,
	style,
	disabled,
	...props
}: {
	options: ChoiceOption[];
	label?: React.ReactNode;
	description?: React.ReactNode;
	value?: string | null | undefined;
	onValueChange: (value: string) => void;
	searchable?: boolean;
	clearable?: boolean;
	placeholder?: string | undefined;
	className?: string | undefined;
	style?: React.CSSProperties | undefined;
	disabled?: boolean | undefined;
	"aria-label"?: string | undefined;
}) {
	const id = React.useId(),
		[open, setOpen] = React.useState(false),
		items = options.map((option) =>
			typeof option === "string" ? { value: option, label: option } : option,
		),
		name =
			props["aria-label"] ?? (typeof label === "string" ? label : undefined),
		current = items.find((item) => item.value === value);
	return (
		<div className={cn("ui-field", className)} style={style}>
			{label && <Label htmlFor={id}>{label}</Label>}
			<div className="flex min-w-0 items-center gap-1">
				{searchable ? (
					<Popover open={open} onOpenChange={setOpen}>
						<PopoverTrigger asChild>
							<Button
								variant="outline"
								id={id}
								role="combobox"
								aria-expanded={open}
								aria-label={name}
								disabled={disabled}
								className="w-full min-w-0 justify-between font-normal"
							>
								<span className="truncate">
									{current?.label ?? placeholder ?? "—"}
								</span>
								<ChevronsUpDown className="opacity-50" />
							</Button>
						</PopoverTrigger>
						<PopoverContent className="w-[min(90vw,450px)] p-0" align="start">
							<Command>
								<CommandInput
									aria-label={name}
									placeholder={placeholder ?? "Search…"}
								/>
								<CommandList>
									<CommandEmpty>No results</CommandEmpty>
									{items
										.filter((item) => item.value)
										.map((item) => (
											<CommandItem
												key={item.value}
												value={`${item.label} ${item.value}`}
												disabled={Boolean(item.disabled)}
												onSelect={() => {
													onValueChange(item.value);
													setOpen(false);
												}}
											>
												<span className="truncate">{item.label}</span>
												{value === item.value && <Check className="ml-auto" />}
											</CommandItem>
										))}
								</CommandList>
							</Command>
						</PopoverContent>
					</Popover>
				) : (
					<Select
						value={value ?? ""}
						onValueChange={onValueChange}
						disabled={disabled}
					>
						<SelectTrigger id={id} aria-label={name} className="w-full min-w-0">
							<SelectValue placeholder={placeholder ?? "—"} />
						</SelectTrigger>
						<SelectContent position="popper">
							{items
								.filter((item) => item.value)
								.map((item) => (
									<SelectItem
										key={item.value}
										data-value={item.value}
										value={item.value}
										disabled={Boolean(item.disabled)}
									>
										{item.label}
									</SelectItem>
								))}
						</SelectContent>
					</Select>
				)}
				{clearable && value && (
					<Button
						variant="ghost"
						size="icon-sm"
						type="button"
						aria-label={`Clear ${name ?? ""}`}
						disabled={disabled}
						onClick={() => onValueChange("")}
					>
						<X />
					</Button>
				)}
			</div>
			{description && <p className="ui-field-hint">{description}</p>}
		</div>
	);
}
export function CheckboxField({
	label,
	checked,
	onCheckedChange,
	...props
}: Omit<React.ComponentProps<typeof Checkbox>, "onCheckedChange"> & {
	label?: React.ReactNode;
	onCheckedChange: (checked: boolean) => void;
}) {
	const id = React.useId();
	return (
		<div className="flex items-start gap-2.5">
			<Checkbox
				{...props}
				id={id}
				checked={checked}
				onCheckedChange={(value) => onCheckedChange(value === true)}
			/>
			{label && (
				<Label htmlFor={id} className="leading-5 font-normal">
					{label}
				</Label>
			)}
		</div>
	);
}
export function ChoiceGroup({
	options,
	value,
	onValueChange,
	...props
}: {
	options: ChoiceOption[];
	value: string;
	onValueChange: (value: string) => void;
	"aria-label"?: string;
}) {
	const id = React.useId();
	return (
		<RadioGroup
			{...props}
			value={value}
			onValueChange={onValueChange}
			className="ui-choice-group"
			orientation="horizontal"
		>
			{options.map((raw) => {
				const option =
					typeof raw === "string" ? { value: raw, label: raw } : raw;
				return (
					<label key={option.value} htmlFor={`${id}-${option.value}`}>
						<RadioGroupItem
							id={`${id}-${option.value}`}
							value={option.value}
							className="sr-only"
						/>
						{option.label}
					</label>
				);
			})}
		</RadioGroup>
	);
}
export function AppDialog({
	open,
	onDismiss,
	title,
	children,
	width = "32rem",
	closeLabel = "Close",
	className,
}: {
	open: boolean;
	onDismiss: () => void;
	title: React.ReactNode;
	children: React.ReactNode;
	width?: string | undefined;
	closeLabel?: string | undefined;
	className?: string | undefined;
}) {
	const opener = React.useRef<HTMLElement | null>(null);
	return (
		<Dialog
			open={open}
			onOpenChange={(value) => {
				if (!value) onDismiss();
			}}
		>
			<DialogContent
				className={cn("ui-dialog", className)}
				style={{ maxWidth: `min(${width}, calc(100vw - 2rem))` }}
				showCloseButton={false}
				aria-describedby={undefined}
				onOpenAutoFocus={() => {
					opener.current =
						document.activeElement instanceof HTMLElement
							? document.activeElement
							: null;
				}}
				onCloseAutoFocus={(event) => {
					if (opener.current?.isConnected) {
						event.preventDefault();
						opener.current.focus();
					}
				}}
			>
				<DialogHeader className="pr-7">
					<DialogTitle>{title}</DialogTitle>
				</DialogHeader>
				{children}
				<DialogClose asChild>
					<Button
						variant="ghost"
						size="icon-sm"
						className="absolute top-3 right-3"
						aria-label={closeLabel}
					>
						<X />
					</Button>
				</DialogClose>
			</DialogContent>
		</Dialog>
	);
}
export function Hint({
	content,
	children,
	delay = 250,
}: {
	content: React.ReactNode;
	children: React.ReactElement;
	delay?: number;
}) {
	return (
		<TooltipProvider delayDuration={delay}>
			<Tooltip>
				<TooltipTrigger asChild>{children}</TooltipTrigger>
				<TooltipContent>{content}</TooltipContent>
			</Tooltip>
		</TooltipProvider>
	);
}
export function Notice({
	title,
	children,
	tone = "blue",
	icon,
	onDismiss,
	className,
	style,
	...props
}: {
	title?: React.ReactNode;
	children?: React.ReactNode;
	tone?: string | undefined;
	icon?: React.ReactNode;
	onDismiss?: (() => void) | undefined;
	className?: string | undefined;
	style?: React.CSSProperties | undefined;
	role?: string | undefined;
}) {
	return (
		<Alert
			{...props}
			data-tone={tone}
			className={cn(onDismiss && "pr-12", className)}
			style={style}
		>
			{icon}
			{title && <AlertTitle>{title}</AlertTitle>}
			<AlertDescription className="text-current">{children}</AlertDescription>
			{onDismiss && (
				<Button
					variant="ghost"
					size="icon-sm"
					className="absolute top-2 right-2"
					aria-label="Dismiss"
					onClick={onDismiss}
				>
					<X />
				</Button>
			)}
		</Alert>
	);
}
export function ExpandPanel({
	open,
	children,
}: {
	open: boolean;
	children: React.ReactNode;
}) {
	return (
		<CollapsiblePrimitive.Root open={open}>
			<CollapsiblePrimitive.Content>{children}</CollapsiblePrimitive.Content>
		</CollapsiblePrimitive.Root>
	);
}
export function Spinner() {
	return (
		<LoaderCircle
			className="size-5 animate-spin text-primary"
			aria-label="Loading"
			role="status"
		/>
	);
}
export function PageControls({
	total,
	value,
	onValueChange,
}: {
	total: number;
	value: number;
	onValueChange: (value: number) => void;
}) {
	if (total <= 1) return null;
	const pages = [
		...new Set([
			1,
			Math.max(1, value - 1),
			value,
			Math.min(total, value + 1),
			total,
		]),
	];
	return (
		<Pagination>
			<PaginationContent>
				<PaginationItem>
					<PaginationPrevious
						href="#"
						aria-disabled={value <= 1}
						onClick={(event) => {
							event.preventDefault();
							if (value > 1) onValueChange(value - 1);
						}}
					/>
				</PaginationItem>
				{pages.map((page) => (
					<PaginationItem key={page}>
						<PaginationLink
							href="#"
							isActive={value === page}
							onClick={(event) => {
								event.preventDefault();
								onValueChange(page);
							}}
						>
							{page}
						</PaginationLink>
					</PaginationItem>
				))}
				<PaginationItem>
					<PaginationNext
						href="#"
						aria-disabled={value >= total}
						onClick={(event) => {
							event.preventDefault();
							if (value < total) onValueChange(value + 1);
						}}
					/>
				</PaginationItem>
			</PaginationContent>
		</Pagination>
	);
}
export function JsonFilePicker({
	accept,
	onFile,
	children,
}: {
	accept: string;
	onFile: (file: File | null) => void;
	children: (props: { onClick: () => void }) => React.ReactNode;
}) {
	const ref = React.useRef<HTMLInputElement>(null);
	return (
		<>
			<input
				ref={ref}
				type="file"
				hidden
				accept={accept}
				onChange={(event) => {
					onFile(event.currentTarget.files?.[0] ?? null);
					event.currentTarget.value = "";
				}}
			/>
			{children({ onClick: () => ref.current?.click() })}
		</>
	);
}
