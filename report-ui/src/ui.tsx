import type * as React from 'react';
import {cva, type VariantProps} from 'class-variance-authority';
import {X} from 'lucide-react';
import {Collapsible as CollapsiblePrimitive, Dialog as DialogPrimitive, Progress as ProgressPrimitive, ScrollArea as ScrollAreaPrimitive, Select as SelectPrimitive, Tabs as TabsPrimitive, Tooltip as TooltipPrimitive} from 'radix-ui';
import {cn} from './lib';

export const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary/90',
        outline: 'border border-border bg-background/70 hover:bg-accent hover:text-accent-foreground',
        ghost: 'hover:bg-accent hover:text-accent-foreground',
        destructive: 'bg-destructive text-white hover:bg-destructive/90',
      },
      size: {
        default: 'h-9 px-4 py-2',
        sm: 'h-8 rounded-md px-3 text-xs',
        icon: 'size-8',
      },
    },
    defaultVariants: {variant: 'default', size: 'default'},
  },
);

export function Button({className, variant, size, ...props}: React.ComponentProps<'button'> & VariantProps<typeof buttonVariants>) {
  return <button data-slot="button" className={cn(buttonVariants({variant, size}), className)} {...props} />;
}

const badgeVariants = cva('inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold', {
  variants: {
    variant: {
      default: 'border-transparent bg-primary text-primary-foreground',
      secondary: 'border-transparent bg-secondary text-secondary-foreground',
      outline: 'text-foreground',
      success: 'border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
      warning: 'border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300',
      danger: 'border-red-500/25 bg-red-500/10 text-red-700 dark:text-red-300',
      blocked: 'border-slate-500/30 bg-slate-500/10 text-slate-700 dark:text-slate-300',
      conflict: 'border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-300',
    },
  },
  defaultVariants: {variant: 'default'},
});

export function Badge({className, variant, ...props}: React.ComponentProps<'span'> & VariantProps<typeof badgeVariants>) {
  return <span data-slot="badge" className={cn(badgeVariants({variant}), className)} {...props} />;
}

export function Card({className, ...props}: React.ComponentProps<'section'>) {
  return <section data-slot="card" className={cn('rounded-xl border border-border/80 bg-card/92 text-card-foreground shadow-sm backdrop-blur', className)} {...props} />;
}

export function CardHeader({className, ...props}: React.ComponentProps<'div'>) {
  return <div className={cn('flex flex-col gap-1.5 p-5', className)} {...props} />;
}

export function CardTitle({className, ...props}: React.ComponentProps<'h2'>) {
  return <h2 className={cn('text-base font-semibold tracking-tight', className)} {...props} />;
}

export function CardDescription({className, ...props}: React.ComponentProps<'p'>) {
  return <p className={cn('text-sm text-muted-foreground', className)} {...props} />;
}

export function CardContent({className, ...props}: React.ComponentProps<'div'>) {
  return <div className={cn('p-5 pt-0', className)} {...props} />;
}

export function Input({className, ...props}: React.ComponentProps<'input'>) {
  return <input data-slot="input" className={cn('h-9 w-full rounded-md border border-input bg-background/80 px-3 py-1 text-sm shadow-xs outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring', className)} {...props} />;
}

export function Alert({className, ...props}: React.ComponentProps<'div'>) {
  return <div role="alert" className={cn('relative rounded-lg border border-border bg-background/75 p-4 text-sm', className)} {...props} />;
}

export function Progress({className, value, ...props}: React.ComponentProps<typeof ProgressPrimitive.Root>) {
  return (
    <ProgressPrimitive.Root className={cn('relative h-2 w-full overflow-hidden rounded-full bg-secondary', className)} value={value} {...props}>
      <ProgressPrimitive.Indicator className="h-full w-full flex-1 bg-primary transition-transform" style={{transform: `translateX(-${100 - (value ?? 0)}%)`}} />
    </ProgressPrimitive.Root>
  );
}

export function Table({className, ...props}: React.ComponentProps<'table'>) {
  return <div className="w-full overflow-x-auto"><table className={cn('w-full caption-bottom text-sm', className)} {...props} /></div>;
}

export function TableHeader(props: React.ComponentProps<'thead'>) { return <thead className="border-b [&_tr]:border-b" {...props} />; }
export function TableBody(props: React.ComponentProps<'tbody'>) { return <tbody className="[&_tr:last-child]:border-0" {...props} />; }
export function TableRow({className, ...props}: React.ComponentProps<'tr'>) { return <tr className={cn('border-b transition-colors hover:bg-muted/35', className)} {...props} />; }
export function TableHead({className, ...props}: React.ComponentProps<'th'>) { return <th className={cn('h-10 px-3 text-left align-middle text-xs font-semibold uppercase tracking-wide text-muted-foreground', className)} {...props} />; }
export function TableCell({className, ...props}: React.ComponentProps<'td'>) { return <td className={cn('px-3 py-3 align-top', className)} {...props} />; }

export const Dialog = DialogPrimitive.Root;

export function DialogContent({className, children, ...props}: React.ComponentProps<typeof DialogPrimitive.Content>) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm data-[state=closed]:animate-out data-[state=open]:animate-in" />
      <DialogPrimitive.Content className={cn('fixed left-1/2 top-1/2 z-50 grid max-h-[92vh] w-[min(96vw,1180px)] -translate-x-1/2 -translate-y-1/2 gap-4 overflow-hidden rounded-xl border border-border bg-background p-0 shadow-2xl outline-none', className)} {...props}>
        {children}
        <DialogPrimitive.Close className="absolute right-4 top-4 rounded-sm p-1 text-muted-foreground opacity-80 outline-none transition hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring" aria-label="Close">
          <X className="size-4" />
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

export function DialogHeader({className, ...props}: React.ComponentProps<'div'>) { return <div className={cn('space-y-1.5 border-b border-border px-6 py-5 pr-14', className)} {...props} />; }
export function DialogTitle({className, ...props}: React.ComponentProps<typeof DialogPrimitive.Title>) { return <DialogPrimitive.Title className={cn('text-lg font-semibold', className)} {...props} />; }
export function DialogDescription({className, ...props}: React.ComponentProps<typeof DialogPrimitive.Description>) { return <DialogPrimitive.Description className={cn('text-sm text-muted-foreground', className)} {...props} />; }

export const Tabs = TabsPrimitive.Root;
export function TabsList({className, ...props}: React.ComponentProps<typeof TabsPrimitive.List>) { return <TabsPrimitive.List className={cn('inline-flex h-9 items-center justify-center rounded-lg bg-muted p-1 text-muted-foreground', className)} {...props} />; }
export function TabsTrigger({className, ...props}: React.ComponentProps<typeof TabsPrimitive.Trigger>) { return <TabsPrimitive.Trigger className={cn('inline-flex h-7 items-center justify-center rounded-md px-3 text-xs font-medium outline-none transition data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm focus-visible:ring-2 focus-visible:ring-ring', className)} {...props} />; }
export function TabsContent({className, ...props}: React.ComponentProps<typeof TabsPrimitive.Content>) { return <TabsPrimitive.Content className={cn('mt-4 outline-none focus-visible:ring-2 focus-visible:ring-ring', className)} {...props} />; }

export const TooltipProvider = TooltipPrimitive.Provider;
export const Tooltip = TooltipPrimitive.Root;
export const TooltipTrigger = TooltipPrimitive.Trigger;
export function TooltipContent({className, sideOffset = 6, ...props}: React.ComponentProps<typeof TooltipPrimitive.Content>) {
  return <TooltipPrimitive.Portal><TooltipPrimitive.Content sideOffset={sideOffset} className={cn('z-[70] rounded-md bg-foreground px-2.5 py-1.5 text-xs text-background shadow-md', className)} {...props} /></TooltipPrimitive.Portal>;
}

export const Collapsible = CollapsiblePrimitive.Root;
export const CollapsibleTrigger = CollapsiblePrimitive.Trigger;
export const CollapsibleContent = CollapsiblePrimitive.Content;

export function ScrollArea({className, viewportRef, children, ...props}: React.ComponentProps<typeof ScrollAreaPrimitive.Root> & {viewportRef?: React.Ref<HTMLDivElement>}) {
  return (
    <ScrollAreaPrimitive.Root className={cn('relative overflow-hidden', className)} {...props}>
      <ScrollAreaPrimitive.Viewport ref={viewportRef} className="size-full rounded-[inherit]">{children}</ScrollAreaPrimitive.Viewport>
      <ScrollAreaPrimitive.Scrollbar orientation="vertical" className="flex w-2.5 touch-none select-none border-l border-l-transparent p-px">
        <ScrollAreaPrimitive.Thumb className="relative flex-1 rounded-full bg-border" />
      </ScrollAreaPrimitive.Scrollbar>
      <ScrollAreaPrimitive.Corner />
    </ScrollAreaPrimitive.Root>
  );
}

export const Select = SelectPrimitive.Root;
export const SelectValue = SelectPrimitive.Value;
export function SelectTrigger({className, children, ...props}: React.ComponentProps<typeof SelectPrimitive.Trigger>) { return <SelectPrimitive.Trigger className={cn('flex h-9 min-w-28 items-center justify-between gap-2 rounded-md border border-input bg-background/80 px-3 text-sm outline-none focus:ring-2 focus:ring-ring', className)} {...props}>{children}<SelectPrimitive.Icon className="text-muted-foreground">⌄</SelectPrimitive.Icon></SelectPrimitive.Trigger>; }
export function SelectContent({className, children, ...props}: React.ComponentProps<typeof SelectPrimitive.Content>) { return <SelectPrimitive.Portal><SelectPrimitive.Content position="popper" className={cn('z-[80] min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-md border border-border bg-popover text-popover-foreground shadow-lg', className)} {...props}><SelectPrimitive.Viewport className="p-1">{children}</SelectPrimitive.Viewport></SelectPrimitive.Content></SelectPrimitive.Portal>; }
export function SelectItem({className, children, ...props}: React.ComponentProps<typeof SelectPrimitive.Item>) { return <SelectPrimitive.Item className={cn('relative flex cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none focus:bg-accent focus:text-accent-foreground', className)} {...props}><span className="absolute left-2"><SelectPrimitive.ItemIndicator>✓</SelectPrimitive.ItemIndicator></span><SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText></SelectPrimitive.Item>; }
