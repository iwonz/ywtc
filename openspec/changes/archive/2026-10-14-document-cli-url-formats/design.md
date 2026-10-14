## Context

The README already has one complete CLI parameter table and quick-start commands. Adding a second source/target reference would duplicate information and create two places that can drift. The parser accepts several concrete URL shapes that can be documented compactly inside the existing “accepted values / format” cells.

## Goals / Non-Goals

**Goals:**

- Make every supported `--source` and `--target` input shape visible in the existing table.
- Use neutral example domains and IDs that can be copied and adapted.
- State the most likely invalid inputs: Yandex page IDs, Confluence space-only URLs, relative Confluence URLs, and Markdown link notation.
- Keep the reference consistent with `parseWikiSource` and `ConfluenceClient.resolveTarget`.

**Non-Goals:**

- Changing accepted input syntax or validation behavior.
- Adding another URL-format section or repeating full migration commands.
- Changing retry, resume, conflict, content-degradation, or destructive-operation behavior.

## Decisions

- Expand only the “accepted values / format” cells for `--source` and `--target`, using `<br>` line breaks so the main CLI table remains the single reference.
- Keep one short note below the table for constraints shared by the examples: raw values in shell quotes, matching configured hosts/origins, and unsupported identifier forms.
- Include both legacy and modern Confluence page URLs because the resolver supports `pageId`, `/pages/<id>`, `/content/<id>`, and `/display/<space>/<title>` patterns.

## Risks / Trade-offs

- [The table becomes wider] → Keep examples concise and move common validation wording to one note below it.
- [Examples can imply a new parser contract] → Verify every syntax against the current source and existing parser tests before publishing.
