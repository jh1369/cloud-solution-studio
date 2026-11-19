# Instructions for coding agents

Work only on generic non-sensitive code, synthetic sample data and publicly verifiable product documentation. Never read paths outside the approved repository or seek customer files, company-internal PPTs, credentials or private pricing tables. Do not upload or commit any confidential content. Do not create remote network connections unless explicitly approved for a defined public documentation or official price API endpoint.

Read the current priority and baseline in `docs/DEVELOPMENT_STATUS.md`. Keep the existing Huawei engine backward-compatible and use the same quotation engine for web and offline delivery. Limit Python additions to offline PDF and catalog processing. Only Huawei and TCP adapters are in scope. Keep mapping, SKU validation, price retrieval, cost calculation and formatting separate. Unknown prices or mappings stay Pending. Use public information and synthetic samples.

Standing deployment authorization (2026-11-17): deploy each checked release to the existing owner-private Pricing Studio Site with the same access scope, and provide its offline delivery.

Standing GitHub authorization (2026-11-18): after completing and sufficiently verifying a Cloud Solution Studio task, merge its reviewed changes into `jh1369/cloud-solution-studio` without asking again. Complete the security review below before every sync. When the user explicitly requests an earlier GitHub handoff, mark the version as a candidate and record the outstanding acceptance checks. The standing deployment authorization applies to checked releases. Follow the repository's branch rules and the user's instructions for the current task.

TCP catalog publication is automatic after official-source and pricing-rule validation, including the first baseline. Retry anomalies within the configured limits. Keep unresolved or unsupported prices Pending and preserve historical snapshots.

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
- Do not present cloud workspace paths as downloadable chat attachments. For a synchronized version, verify its actual GitHub download. Apply the standing GitHub and Site authorizations only after their checks pass.

### Security review before any commit or synchronization

- Review `git status --short`, `git diff --stat`, `git diff` and `git diff --cached`. Include untracked files and any newly generated artifacts in the review; use an explicit file allowlist for staging, never indiscriminately stage unrelated work.
- Check code, documents, fixtures, logs, caches, binaries, generated exports and any commits proposed for publication. Do not include customer materials or customer-derived inventories, internal PPTs, true quotations/discounts, account identifiers, personal data, tokens, cloud credentials or private pricing.
- `.gitignore` is not a security boundary. If sensitive content is discovered, do not print or copy its values into reports, status files, issues or patches; exclude it and report the category and affected scope without disclosure.
- Only reviewed generic code, sanitized documentation and fictional test data may be committed to GitHub. Public product/price metadata must retain provenance and still pass the repository's security policy.
- Push or merge only under the standing GitHub authorization above or specific authorization for the current change. A safety review, prior read access or past publication alone does not grant authorization. Apply the same conditions to API writes, remote commits and PRs.
- Record local, synchronized and deployed versions separately. Keep incomplete work local unless the user requests a candidate handoff.
- No background synchronization, automatic uploads, secret discovery or credential scanning outside the approved development repository.

### Private reference-workbook regression

- Every Huawei Pricing Studio online update carries a real-workbook regression entry in `docs/HUAWEI_REAL_REGRESSION.md`. Record the Web version, GitHub base or release commit, target region and acceptance state. The owner imports the same reference workbook privately and submits the anonymized initial and reviewed statistics. Record pending owner acceptance while either required snapshot is unavailable.
- Validate the owner-supplied statistics with `pricing-studio/web/scripts/validate_huawei_regression.mjs` before recording results. Compare the same stages, input-row and billing-mode counts, and preserve any change in test scope. Report source profile, candidate, confirmed, conditional and Pending deltas, reason distributions, separately billed components and the resulting priorities. Use the existing authorized GitHub review and publication workflow for the aggregate report.
- Keep original records, resource names, configurations, SKU combinations, amounts, and workbooks in the owner's isolated environment. Keep verified real aggregates, historic results and synthetic acceptance clearly labeled.

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
- Apply the standing GitHub and Site authorization above to completed, sufficiently checked work. Other repositories, audiences and publication destinations require their own authorization.
- On task completion update DEVELOPMENT_STATUS concisely with changes, verification, unresolved issues, next action and local/remote state. Reducing token use never waives the required security review before an authorized commit or synchronization.
