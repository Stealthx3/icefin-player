# Decisions that need the user

The user asked (2026-11-16): when a step needs a human decision, prompt their phone and keep working on other
tasks while the question waits. This is how.

## The pieces
- **IceFin Decisions** (claude.ai page, pinned in the user's sidebar): https://claude.ai/artifact/Wk2onzLzmJoLXHDXxCShei.
  Each open question shows its context, its options (tap one), a note field and what is waiting on it; answers are
  kept in the page's database, collection `decisions`. Source: `docs/dev/decisions-page.html` (publish to the same
  URL; the page declares `db` and `user`).
- **The phone push**: the session's `PushNotification` tool, which reaches the phone through Remote Control
  (`docs/standards/PHONE-ALERTS-STANDARD.md`; `node scripts/phone-alerts.mjs check` must say READY).

## When a step needs the user
1. **Write the question** to the page's database (`ArtifactData` `set`, collection `decisions`, a short kebab-case id):
   `question`, `topic`, `asked` (ISO time), `status: "open"`, `context` (what was found, in plain words), `options`
   (`[{label, description, recommended}]`, the recommended one first), `blocks` (exactly which step waits on it, and
   what goes ahead meanwhile).
2. **Push** one line to the phone: what to decide and that it is on the IceFin Decisions page. One push per new
   question; never a reminder push for the same question.
3. **Mark only the dependent step blocked** (in the session's task list and, for a pass, in its pass doc) and carry
   on with everything that doesn't depend on the answer. Don't use a blocking `AskUserQuestion` for these.
4. **Check for answers between steps** (`ArtifactData` `query`, `status == "answered"`), and before any step that
   needs one. The user may also answer in chat; then mark the question answered on the page (`update`, with
   `answer`, `note`, `answeredAt`) so the page and the record agree.
5. **Record the answer** where it belongs: a settled decision in `docs/DECISIONS.md`, a pass's choice in its pass
   doc, then act on it.

## What counts as a human decision
The gates of a pipeline pass (mock-ups, built screens), anything a decision in `docs/DECISIONS.md` reserves to the
user, host system changes (sudo, udev rules, user settings), publishing outside the test repository, and anything
outward-facing or hard to undo. Everything else proceeds without asking (memory: continuous work).
