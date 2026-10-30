# Shared operator UI

All interactive applications import this local shadcn/ui component source.
Primitives originate from the official `new-york-v4` Radix registry at
https://ui.shadcn.com/r/styles/new-york-v4/ (MIT, retrieved 2026-10-29).
Local adaptations include relative imports, configurable accessible close labels,
virtualized scroll viewport refs, and application-specific field compositions.
Select menus unmount immediately on close so a following Escape reaches the dialog.

`styles.css` supplies shared semantic tokens and explicit Tailwind source roots.
Screen layout uses semantic HTML; `fields.tsx` composes primitives and labels.
The CLI never imports this source at runtime. Production builds embed it locally.

Text actions use `Button` with `leadingIcon` for a decorative icon and a shrinkable,
wrapping label. Icon-only controls keep an accessible name; semantic selectors do
not need an extra action icon. Use the stable `ui-button` classes for layout:
Radix tooltip composition can replace `data-slot`. With `asChild`, the caller owns
the single child and its content. The GitHub mark comes from MIT-licensed Octicons;
its attribution is included in `LICENSE`.

Text actions may shrink beside sibling controls, retaining their icon and minimum
content width. Data containers inherit word wrapping so unbroken provider labels
cannot extend outside their row; full labels remain available without truncation.
