# Dashboard accessibility review — 14 November 2026

This focused review covers the local dashboard's current fixture states and the deployed Forge app's current fixed-scan view. It is not a full WCAG conformance assessment or a screen-reader certification.

## Changes and reasons

The local dashboard's secondary text was too faint: the rendered vulnerable view yielded 32 samples below a 4.5:1 text contrast threshold, out of 72 sampled text elements. Some samples are incidental or brand text, so this is a measurement count rather than a formal count of WCAG violations. Text that describes evidence, coverage, confidence and remediation was affected. Small labels were 8–11 px. The page's 320 px minimum width also forced horizontal overflow when a scrollbar reduced the available content width to 305 px.

Muted text now uses stronger colors, the smallest labels are at least 12 px, evidence and issue text wrap, and the page can fit the available width. A visible-on-focus skip link moves keyboard focus to the main review area. Workflow states have textual accessible labels. An empty severity filter says **Filtered view**, rather than suggesting a clean rescan.

The unavailable-service check exposed a separate presentation bug: a failed rescan could leave an earlier success notice and source-validation wording visible. Starting a rescan now clears its earlier notice; failure clears the previous report and selected evidence. The page announces one actionable error, says **No scan loaded**, and no longer claims rule coverage or a completed scan. Invalid/non-JSON service responses receive a readable message. Restoring the local API and retrying recovers the vulnerable report.

The Rust core, report semantics, fixture sources and Forge implementation are unchanged by this UI follow-up.

## Observed checks

- Keyboard: first Tab exposes **Skip to scan review**, Enter focuses `main`, and the next Tab reaches the rescan action. Filtering, selecting the storage-order finding, expanding all three related evidence sections, creating a local draft and running the fixed rescan worked with keyboard activation. Status text reflected the completed local draft and fixed rescan. No new Jira issue was created in this review.
- Reflow: with related source evidence expanded, requested widths of 320, 768, 1024 and 1280 px produced content widths of 305, 753, 1009 and 1265 px respectively. Document scroll width equalled content width in all four cases; no measured main-content element extended beyond the right edge. The 15 px difference is the browser scrollbar.
- Contrast: the sampled vulnerable/expanded, fixed, filtered and unavailable-service states had no below-threshold text samples after the changes. The lowest sampled local ratio was 4.64:1. The existing Forge fixed-scan view had 45 sampled text elements and a minimum ratio of 5.29:1; it needed no stylesheet change.
- Motion: emulating `prefers-reduced-motion: reduce` produced automatic rather than smooth scrolling and 0.00001 s button/summary transitions. Emulation and viewport overrides were reset afterward.
- Failure/recovery: with this review's local fixture service stopped, a rescan showed one alert, no status success message, no evidence card and **No scan loaded**. Restarting that service and retrying restored three findings from the compiler-assisted semantic fixture.
- Build: the local dashboard production build passed. The release snapshot check confirmed that the scanner, Forge code, lockfiles and fixture bytes were unchanged, so their earlier validation remains applicable; this review does not claim a new full-core test run.

Contrast measurements read rendered foreground colors, font sizes and ancestor background colors. They omit hidden/disabled controls and calculate the luminance ratio before thresholding; displayed numbers are rounded only for reporting. They do not cover image text, every browser/OS combination, all assistive technologies, all focus/non-text contrast requirements or all possible future source content. Native screenshots and manual keyboard/reflow checks complement these measurements.

The contrast and width targets follow the [W3C contrast guidance](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html) and [W3C reflow guidance](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html). No automated measurement alone establishes overall accessibility.

## Repeat the focused review

Start the real local fixture API and dashboard as described in the deployment guide. Use the optional native compiler for the multi-file semantic fixture. At each width, select the storage-order finding and expand its related evidence. Check that source, digest and action text remain reachable and readable. Use keyboard navigation to create a local draft, rescan the fixed fixture and inspect the result. Stop only the local test API, retry, confirm an unavailable result rather than a clean report, then restart it and recover. This local failure test does not exercise or alter the live Forge service.

Keep local demo drafts distinct from the actual Jira acceptance records. Sharing and external installation were pending at the time of this interface review. Subsequent production sharing and separate-site acceptance are recorded in the [current judge guide](judge-guide.md); this historical accessibility review does not cover every later control.
