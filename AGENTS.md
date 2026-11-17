# Instructions for coding agents

Work only on generic non-sensitive code, synthetic sample data and publicly verifiable product documentation. Never read paths outside the approved repository or seek customer files, company-internal PPTs, credentials or private pricing tables. Do not upload or commit any confidential content. Do not create remote network connections unless explicitly approved for a defined public documentation or official price API endpoint.

Priority: Pricing Studio V0.3 TCP catalog extraction/update work on synchronized V0.2.0-dev baseline `f8ea276`. Keep the existing Huawei engine backward-compatible; Python additions are offline PDF/catalog processing, never a duplicate quotation system. Only Huawei and TCP adapters are in scope; Alibaba/Tencent remain future adapters. Separate mapping, SKU validation, price retrieval, cost calculation and formatting; unknown prices or mappings remain Pending. Use only public/synthetic data.

Standing deployment authorization (user explicitly granted 2026-11-17): after completing checks for each version of this project, automatically deploy to the existing owner-private Pricing Studio Site, keeping its audience unchanged, and provide the version's offline delivery. Do not ask again for this same authorized deployment. This overrides the default no-automatic-deployment rule below for that Site and scope; it does not authorize sharing/access changes, unrelated projects or unchecked releases. The user also explicitly authorized GitHub synchronization for the current V0.3 task; future GitHub Push still requires its own applicable authorization. Ordinary catalog data validation is not manual approval: keep anomalous/initial/complex TCP prices Pending until reviewed.

If a feature needs access to local confidential files, create an abstract interface and document how a separately executed local component would supply approved input. Do not implement any behavior that exfiltrates files.

## Project status and Codex / ChatGPT collaboration

### Start each development task

- Start with the current-state and latest relevant entry in `docs/DEVELOPMENT_STATUS.md`, then inspect only code needed for the task. Obey AGENTS and SECURITY; reuse unchanged instructions already read in the current context. Read changed or missing rule sections when needed, rather than repeatedly reading entire files. Consult README/ROADMAP only when relevant to scope or architecture. If the status file is missing, derive it from actual code and Git evidence, not assumed plan completion.
- Confirm the repository, branch, HEAD and existing working-tree changes. Preserve unrelated or in-progress work. Distinguish this repository from separate prototypes, other checkouts and hosted versions.
- Treat `docs/DEVELOPMENT_STATUS.md` as the shared state reference. Code and reproducible evidence take precedence when that file is stale; explain and correct the discrepancy.

### Complete each development task

Before reporting a task complete, add a concise incremental update to `docs/DEVELOPMENT_STATUS.md` (and correct the current snapshot only when facts change), covering:

1. Current package/project version, branch or inspected commit, overall stage, completed work and work still in progress. Do not mark planned or unmerged functionality as delivered.
2. Features **added, changed and removed** in this task; explicitly write “none” when a category is empty. Record documentation-only work as documentation-only.
3. Test commands, execution directory, relevant runtime, exact pass/fail counts, checks not run and verification limits. Never count zero discovered tests as a successful suite, or reuse another repository's test count as this repository's result.
4. Unresolved defects, limitations, risks and blockers, with priorities. Preserve known issues instead of omitting them from the completion summary.
5. Next development plan and GitHub synchronization status: local/uncommitted, local commit not pushed, or explicitly authorized and actually synchronized. Update the task-change record as well as the current snapshot.

For a significant architecture change, also update root `README.md` and `docs/ROADMAP.md` in the same change. Describe the resulting runtime, dependencies, storage, interfaces and migration/compatibility decisions. Planning a change does not mean it has been implemented.

### Offline delivery for every completed Pricing Studio version

- Each completed version must include a shareable standalone offline HTML and ZIP, not just hosted source. Use the same web pricing engine; do not create a second quotation implementation.
- Set the version in `pricing-studio/web/package.json`. Run `npm run release:offline` from that directory; it runs the full relevant regression and archives to `releases/pricing-studio/v<version>/`. Generated filenames, visible offline version and manifest must match the package version.
- Keep version archives immutable. Changed content requires a new package version; never silently replace an older delivery. Same-source rebuilds must produce identical ZIP bytes.
- Include bilingual usage instructions, fictional sample data, third-party notices, artifact checksums and source fingerprints. Preserve original official verification times and expiry; missing/expired/unconfirmed items remain Pending. No customer input, quotations, credentials, hosting identity or internal materials in the bundle.
- Update the release index and DEVELOPMENT_STATUS with artifact paths, tests, limitations and synchronization state. Record actual browser verification separately; packaging checks cannot substitute for a real double-click/import/download test.
- Do not present cloud workspace paths as downloadable chat attachments. For a synchronized version, verify its actual GitHub download; colleagues can share the downloaded file without a site account. Preserve the existing no-automatic-Push/deploy/publish rules: this offline requirement alone does not authorize remote publication.

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

## Token-Efficient Development Mode — current default

This mode supersedes the earlier default Multi-Agent workflow. Pricing Studio V0.3 TCP catalog work is the current priority. Efficiency never overrides safety, functional correctness or necessary test quality.

### Agent management

- Default to one primary Agent. Do not automatically start, restart or continue Subagent work.
- Simple changes, bug fixes and tests use a single Agent.
- Only suggest Subagents when the task has independent modules and parallelism offers a concrete efficiency benefit. Explain the bounded tasks and obtain the user's consent **before** spawning them; prior Multi-Agent consent does not carry over to a new task.
- If separately approved, assign non-overlapping file ownership and exchange concise findings; the primary Agent integrates results and updates shared status.

### Context and task scope

- Prefer the current state in DEVELOPMENT_STATUS and task-relevant files. Locate specific code with targeted searches; do not scan the whole repository without a task-based reason.
- Reuse unchanged AGENTS/SECURITY content already known in this context. Check relevant changes rather than repeatedly dumping full documents or history. Re-read necessary instructions when context or rules are uncertain.
- Work on one clearly defined feature or bug at a time. Preserve existing changes; avoid unrelated files, broad refactors and speculative implementation.
- After a long task, save key decisions, unresolved work and the next concrete step in DEVELOPMENT_STATUS so a new conversation can resume with little context.

### Verification

- Run focused tests first. Run the full relevant regression at final integration or when cross-module impact, failures or unresolved risk justify it.
- Do not lower necessary test standards, replace independent expected results with implementation behavior, treat zero discovered tests as success, or reuse an older suite result as this task's result.
- Documentation-only tasks may use structural/link/diff checks; report that business tests were not run. Preserve existing test records and limitations without claiming new passes.

### Output, models and tools

- Report only changes, test outcome, issues found and the recommended next step. Avoid repeated source dumps, full logs, full test listings and unsolicited long technical analyses.
- Use concise incremental status entries; update README/ROADMAP only when affected by scope or significant architecture decisions.
- When the runtime actually permits model/reasoning selection, prefer a lightweight model and lower reasoning effort for simple work; use stronger settings for complex pricing, architecture or major incidents. Do not spawn a Subagent solely to switch models, and never claim a model switch the runtime did not perform.
- Avoid unnecessary network research, repeated tool calls and re-verification of unchanged evidence. Batch independent relevant reads where useful; keep edits and dependent checks sequential.

### Safety and synchronization

- All existing AGENTS and SECURITY safeguards remain in force. Approved project files, public product information and fictional test data only; no customer/internal material, private quotes, credential discovery or sensitive uploads.
- Do not automatically commit, Push, deploy or publish. Each synchronization/release needs the user's explicit authorization for that action; historical V0.1.1 publication does not authorize new releases.
- On task completion update DEVELOPMENT_STATUS concisely with changes, verification, unresolved issues, next action and local/remote state. Reducing token use never waives the required security review before an authorized commit or synchronization.
