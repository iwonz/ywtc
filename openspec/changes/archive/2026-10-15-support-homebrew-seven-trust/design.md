## Context

Homebrew 7 introduced explicit trust for non-official tap formulas. A real installation of the published `iwonz/ywtc` tap failed after `brew tap` with an instruction to run `brew trust --formula iwonz/ywtc/ywtc` or `brew trust iwonz/ywtc`. The explicit tap-scoped form `brew trust --tap iwonz/ywtc` succeeded, after which installation and formula tests completed with ywtc 2.0.1.

The current README and generated GitHub installation block omit that step, so users following supported commands on current Homebrew cannot install the otherwise valid formula.

## Goals / Non-Goals

**Goals:**

- Present one consistent, working Homebrew 7 command sequence everywhere.
- Make the security-sensitive trust decision explicit and tap-scoped.
- Include corrected guidance in npm's rendered README through a patch release.

**Non-Goals:**

- Automatically trusting the repository from ywtc code or install hooks.
- Broadly trusting every third-party tap or bypassing formula audit.
- Changing product retry, resume, conflict, content degradation, or migration behavior.

## Decisions

### Require explicit tap-scoped trust

Documentation and generated release notes will use:

```bash
brew tap iwonz/ywtc https://github.com/iwonz/ywtc.git
brew trust --tap iwonz/ywtc
brew install ywtc
```

Tap-scoped trust is clearer than trusting only the current formula because future `brew upgrade ywtc` operations resolve through the same maintained tap. Suppressing the error or using a shell fallback was rejected because trust is a user security decision and command failures must remain visible.

### Publish the documentation correction

The correction uses a `fix` commit so Release Please creates a patch whose npm README, GitHub notes, and repository documentation agree. Future release notes are generated with the trust step. The current release note is corrected through the ordinary next release rather than rewriting package artifacts.

No product retry, resume, conflict, or degradation state changes. Release publication remains idempotent and OIDC-based.

## Risks / Trade-offs

- **[Older Homebrew lacks `brew trust`]** → State that this step is required by current Homebrew for non-official taps; npm/npx remain installation alternatives.
- **[Users trust a repository they did not inspect]** → Keep the trust command explicit, narrowly scoped to `iwonz/ywtc`, and explain its meaning.
- **[Release notes drift from README]** → Assert the exact command in workflow regression tests and use the same three-step order.

## Migration Plan

1. Update README, release-note generation, and regression tests.
2. Run the complete quality gate and archive the OpenSpec change.
3. Publish the resulting patch through Release Please and verify npm, npx, GitHub, and Homebrew again.

Rollback removes the documented trust command, but published package versions remain immutable.

## Open Questions

None.
