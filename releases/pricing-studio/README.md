# Pricing Studio offline versions

Every completed version includes a standalone HTML and ZIP. Download the ZIP from GitHub (click **Raw / Download raw file** if the file page appears), unzip, then double-click the HTML in Chrome/Edge/Firefox. Share the downloaded ZIP/HTML directly with colleagues; no website account or installation is needed.

每个版本都保留独立的 HTML 和 ZIP。请下载 ZIP（若打开 GitHub 文件页面，点击 Raw / Download raw file），解压后双击 HTML。可把文件直接分享给同事。云端开发目录链接不等于下载附件。

| Version | Status | Download | Details |
| --- | --- | --- | --- |
| 0.3.1-dev | Browser QA candidate. Authenticated production testing and native HTML file testing pending. | [Download ZIP](https://raw.githubusercontent.com/jh1369/cloud-solution-studio/main/releases/pricing-studio/v0.3.1-dev/Pricing-Studio-0.3.1-dev-Offline.zip) | [Browser acceptance and checklist](../../docs/PRICING_BROWSER_ACCEPTANCE.md) |
| 0.3.0-dev | TCP catalog/data phase; TCP quoting not enabled | [ZIP](v0.3.0-dev/Pricing-Studio-0.3.0-dev-Offline.zip?raw=true) | [Files and instructions](v0.3.0-dev/README.md) |
| 0.2.0-dev | Candidate; real-browser acceptance outstanding | [ZIP](v0.2.0-dev/Pricing-Studio-0.2.0-dev-Offline.zip?raw=true) | [Files and instructions](v0.2.0-dev/README.md) |

Prices retain their original per-item seven-day verification validity; expired, missing or unconfirmed items stay Pending. Offline live refresh is unavailable. Obtain a newly verified package when needed; rebuilding cannot extend prices.

Maintainers: update the package version, run `npm run release:offline` in `pricing-studio/web/`, review source/artifact safety and update this index plus DEVELOPMENT_STATUS. Archived versions are immutable. This command never commits, Pushes or deploys. No customer data, credentials, real quotation exports or hosting configuration belong here.
