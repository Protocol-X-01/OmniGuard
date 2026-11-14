# Static judge page

[Open the public project site](https://omniguard-n5h9.onrender.com/). The initial Render deployment became live on 14 November 2026 from commit `92bf31b2f8e00bca085ee1b2201f0df06da7733b`; all eight public assets/downloads matched the reviewed local build. See the [hosting acceptance record](../docs/acceptance-static-site-2026-11-14.md).

This page serves a guide, actual production screenshot and exact isolated fixture downloads. It has no JavaScript, forms, backend, scan upload or analytics. The installation link opens Atlassian; the Rust scanner and Forge runtime stay separate.

Build with Python 3.11+:

```sh
python3 site/build.py
python3 -m http.server 4174 --bind 127.0.0.1 --directory site/dist
```

For Render, create a **Static Site** from this repository on `main`, set build command `python3 site/build.py`, publish directory `site/dist`, and environment variable `SKIP_INSTALL_DEPS=true`. No secrets or paid compute instance are required by this page. Static hosting uses the workspace's bandwidth/build allowances; verify current account limits before deployment.

The owner confirmed the connected workspace before creation. The existing service is named `omniguard`; do not create another service to update it. Automatic deployment is disabled. Hosting this page does not supply a second Jira tenant or establish independent judge-installation acceptance.

Use Render's HTTPS defaults. Recommended response headers: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, and a restrictive Content-Security-Policy consistent with the page's meta policy. The meta policy cannot enforce `frame-ancestors`; use a response header for that directive. These recommendations are not a claim that all headers were configured by the limited creation API. Keep automatic deployment disabled unless the owner chooses another update policy.
