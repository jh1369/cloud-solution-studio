# Instructions for coding agents

Work only on generic non-sensitive code, synthetic sample data and publicly verifiable product documentation. Never read paths outside the approved repository or seek customer files, company-internal PPTs, credentials or private pricing tables. Do not upload or commit any confidential content. Do not create remote network connections unless explicitly approved for a defined public documentation or official price API endpoint.

Priority: Pricing Studio V0.1, AWS -> Huawei Cloud Public, region `eu-west-101`. Separate 1) vendor mapping; 2) SKU validation; 3) price source and retrieval; 4) cost calculation; 5) output formatting. Explicitly mark unknown SKU mappings and prices as `PENDING_REVIEW`, never fabricate values. Use only fictitious test data.

If a feature needs access to local confidential files, create an abstract interface and document how a separately executed local component would supply approved input. Do not implement any behavior that exfiltrates files.

## Project status and Codex / ChatGPT collaboration

### Start each development task

- Read `docs/DEVELOPMENT_STATUS.md`, `README.md`, `docs/ROADMAP.md` and `SECURITY.md` before planning changes. If the status file does not exist, create it from inspected code, documents and Git history, not from assumed completion of a plan.
- Confirm the repository, branch, HEAD and existing working-tree changes. Preserve unrelated or in-progress work. Distinguish this repository from separate prototypes, other checkouts and hosted versions.
- Treat `docs/DEVELOPMENT_STATUS.md` as the shared state reference. Code and reproducible evidence take precedence when that file is stale; explain and correct the discrepancy.

### Complete each development task

Before reporting a task complete, update `docs/DEVELOPMENT_STATUS.md` with:

1. Current package/project version, branch or inspected commit, overall stage, completed work and work still in progress. Do not mark planned or unmerged functionality as delivered.
2. Features **added, changed and removed** in this task; explicitly write “none” when a category is empty. Record documentation-only work as documentation-only.
3. Test commands, execution directory, relevant runtime, exact pass/fail counts, checks not run and verification limits. Never count zero discovered tests as a successful suite, or reuse another repository's test count as this repository's result.
4. Unresolved defects, limitations, risks and blockers, with priorities. Preserve known issues instead of omitting them from the completion summary.
5. Next development plan and GitHub synchronization status: local/uncommitted, local commit not pushed, or explicitly authorized and actually synchronized. Update the task-change record as well as the current snapshot.

For a significant architecture change, also update root `README.md` and `docs/ROADMAP.md` in the same change. Describe the resulting runtime, dependencies, storage, interfaces and migration/compatibility decisions. Planning a change does not mean it has been implemented.

### Security review before any commit or synchronization

- Review `git status --short`, `git diff --stat`, `git diff` and `git diff --cached`. Include untracked files and any newly generated artifacts in the review; use an explicit file allowlist for staging, never indiscriminately stage unrelated work.
- Check code, documents, fixtures, logs, caches, binaries, generated exports and any commits proposed for publication. Do not include customer materials or customer-derived inventories, internal PPTs, true quotations/discounts, account identifiers, personal data, tokens, cloud credentials or private pricing.
- `.gitignore` is not a security boundary. If sensitive content is discovered, do not print or copy its values into reports, status files, issues or patches; exclude it and report the category and affected scope without disclosure.
- Only reviewed generic code, sanitized documentation and fictional test data may be committed to GitHub. Public product/price metadata must retain provenance and still pass the repository's security policy.
- **Do not automatically Push.** Push requires an explicit user instruction for the relevant repository/change; a safety review, prior read access, past publication or a generic development request is not Push authorization.
- Do not bypass the no-Push rule by using GitHub API file writes, creating remote commits/PRs, or automatic publication hooks. Do not automatically commit or deploy as part of this status-maintenance mechanism. When only local work is authorized, leave a reviewable local diff and state that the remote has not changed.
- No background synchronization, automatic uploads, secret discovery or credential scanning outside the approved development repository.

### Role split and handoff

- ChatGPT: requirements planning, solution design, analysis of publicly documented cloud capabilities and technical review.
- Codex: code development, testing, implementation and evidence-based state updates.
- Use the same `docs/DEVELOPMENT_STATUS.md` revision for handoff. Read the repository copy when available; otherwise share only its sanitized contents and identify the branch/commit. Do not assume conversation history or separate workspaces automatically synchronize.
- End each task with a concise handoff covering changes, tests, unresolved issues, next steps and synchronization status. Do not change the agreed Pricing Studio priority while establishing or maintaining this mechanism.
