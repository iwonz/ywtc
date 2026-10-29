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
