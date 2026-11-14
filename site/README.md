# Static judge page

This page serves a guide, actual production screenshot and exact isolated fixture downloads. It has no JavaScript, forms, backend, scan upload or analytics. The installation link opens Atlassian; the Rust scanner and Forge runtime stay separate.

Build with Python 3.11+:

```sh
python3 site/build.py
python3 -m http.server 4174 --bind 127.0.0.1 --directory site/dist
```

For Render, create a **Static Site** from this repository on `main`, set build command `python3 site/build.py`, publish directory `site/dist`, and environment variable `SKIP_INSTALL_DEPS=true`. No secrets or paid compute instance are required by this page. Static hosting uses the workspace's bandwidth/build allowances; verify current account limits before deployment.

The connected Render workspace must be confirmed before creating the service. The page has been prepared locally; this document does not assert a hosted URL. Hosting this page does not supply a second Jira tenant or establish independent judge-installation acceptance.

Use Render's HTTPS defaults. Recommended response headers: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, and a restrictive Content-Security-Policy consistent with the page's meta policy. The meta policy cannot enforce `frame-ancestors`; use a response header for that directive. Keep automatic deployment disabled until the destination and public contents have been reviewed.
