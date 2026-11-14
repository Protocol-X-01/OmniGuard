# Public judge guide — 14 November 2026

[OmniGuard's project site](https://omniguard-n5h9.onrender.com/) is live on Render. The owner explicitly selected “My Workspace” for this prepared static page.

- Render service: `srv-dbs2frlg1s2s73e0gpsg`, type `static_site`, name `omniguard`.
- Initial deploy: `dep-dbs2frtg1s2s73e0gqag`, terminal status `live` at 09:21:08 UTC.
- Deployed commit: `92bf31b2f8e00bca085ee1b2201f0df06da7733b` (the public `v0.1.4` tag).
- Build: `python3 site/build.py`; publish directory: `site/dist`; `SKIP_INSTALL_DEPS=true`.
- Automatic deployments and preview environments are off. No application server, database or credentials were added.

Anonymous HTTPS requests to the page, stylesheet, production screenshot, three JSON reports, judge ZIP and checksums all returned HTTP 200 and matched the reviewed local build byte for byte. The rendered page showed the installer, public privacy/support links, fixture downloads and actual production acceptance, with the independent judge-site limitation retained.

The judge ZIP SHA-256 is `36adf2815f2822caabb76ae072f5b278b614696908f9535b52e448882d697dfe`, matching the published GitHub release. The three fixture reports match `reports/judge/`. The public project guide accepts no scan uploads and has no JavaScript, forms or analytics.

This verifies the static guide and downloads. It does not create a second Jira tenant, prove an independent installation, publish a YouTube video or submit the Codegeist entry. The Rust core and Forge app remain separate from the Render site.
