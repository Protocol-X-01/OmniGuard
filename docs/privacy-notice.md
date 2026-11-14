# OmniGuard Privacy Policy

## About this notice

Effective 14 November 2026, updated for the Bitbucket PR integration. This notice describes OmniGuard engine 0.1.4 and its early-access Forge Jira and Bitbucket apps, maintained by Protocol-X / cs0lutions. For support, privacy questions, or a security report, contact protocolx76@gmail.com.

OmniGuard helps review isolated, authorized Solidity fixtures and track their remediation in Jira. The local scanner and the Forge app are separate. This page also explains the information handled when you contact support.

## Information handled

The local scanner reads the source files you select and generates reports containing file paths, source excerpts, findings and hashes. Source stays on your machine unless you choose to share or import it. Exported scan bundles include full selected source text.

When you import a bundle into the Jira app, it stores that bundle, source text, findings, source and bundle hashes, target and revision details, analysis metadata, and import time. The privacy update stops saving the importing user’s Atlassian account ID in new scan records. Older records may retain that field until a project administrator uses the removal control described below.

For a Bitbucket PR import, the Jira app retrieves the public repository’s report and selected Solidity source files, checks their exact bytes, and stores the repository/workspace UUIDs, PR number, canonical URL, source commit and destination commit with the scan. Only public isolated-fixture repositories are supported. The separate Bitbucket panel reads the public report for its current PR and displays validated evidence; it does not persist source bundles in its own app storage.

The app also stores Jira project identifiers and remediation records, including issue keys, finding baselines, statuses, verification comment references and timestamps. Jira provides the signed-in user context and permission information needed to perform the requested actions.

If you email support, your email address, message and any attachments are handled through the support mailbox. Please include only information needed for your request.

## Why the information is used

Imported information is used to display and validate scan evidence, associate it with the correct Jira project, avoid duplicate remediation issues, compare rescans with their original analysis, and record verification and completion. Legacy importing account IDs recorded who supplied a scan, but are not needed for evidence validation or remediation. Jira independently retains authorship for actions performed through its own APIs.

Jira actions occur when you use the app’s controls: creating a remediation issue, adding a verification comment, or requesting an available completion transition. Support correspondence is used to respond to the request and investigate the reported problem.

## Where information is stored and shared

The Forge app stores its records in Atlassian-hosted Forge storage, scoped to the app installation and separated by Jira project. Jira issues and comments receive evidence excerpts, hashes and remediation details; their visibility follows the Jira site and issue permissions. Authorized app contributors may access operational information through Atlassian’s developer tools.

The Jira app requests permission to read Jira work, write Jira work and use Forge storage, and calls Jira as the current user. Both Forge apps declare backend access only to https://api.bitbucket.org for the PR integration. Requests contain the public repository identifiers, commit IDs and paths needed to retrieve reports and sources. They send no Jira credentials, Jira issue content or imported local source bundles to Bitbucket. The Bitbucket panel has no repository write scope or shared integration secret. The apps contain no advertising, marketing analytics or model-training integration.

If you enable the provided Bitbucket pipeline, Bitbucket runs the scanner against the public fixture branch and retains pipeline logs and generated JSON/SARIF artifacts under its pipeline settings. The versioned report and fixture sources are public repository content. Pipeline checks do not automatically create or close Jira issues.

Atlassian operates Forge, Jira and this Confluence privacy page and may process service, security, diagnostic and visitor information under its own privacy policy. Emailing the Gmail support address also involves Google’s email service. This app notice does not replace those providers’ policies or your organization’s Jira policies.

## Retention and removal

Distinct imported scan snapshots and remediation history remain in app storage. Selecting a new active scan does not delete older snapshots. This early-access version has no automatic expiry schedule or in-app control for deleting source bundles and remediation history. Under Data management, a Jira project administrator can review older scans and permanently remove only their stored importer account-ID field. The app checks project-admin permission and requires confirmation of the current project key. Source, evidence, import times and Jira records are preserved. Removing this field does not remove personal information an uploader may have included in a source bundle.

Jira issues, comments and their history are separate copies managed through Jira. Uninstalling OmniGuard does not remove them. Atlassian controls platform backup and post-uninstallation storage retention.

For an access, correction or removal request, contact protocolx76@gmail.com and identify the affected Jira site/project and record where possible. Identity and authority may need to be verified before a request is acted on. Requests concerning Jira issue content may also require your Jira administrator. Support messages are retained in the support mailbox; there is no fixed automatic deletion period.

## Your choices and privacy requests

Choose which local sources to scan, which bundles to import, and which public PR URL to connect. Use isolated, authorized test material for this early-access release. Do not include credentials, private keys, unrelated personal data or confidential material you are not permitted to share.

You can stop importing reports or ask your site administrator to uninstall the app. To ask about access, correction, deletion, restriction or an objection to use of your personal information, email the privacy contact above. Applicable rights depend on your circumstances and local law.

## Security and changes

The app validates imported report structure and source evidence, checks the Jira project context, and uses the current user’s Jira permissions for remediation actions. These controls reduce risk; they are not a guarantee that a service or scan result is free of vulnerabilities.

This privacy page contains explanatory text and links only. We have added no custom scripts, forms, trackers, uploads or executable examples. Confluence supplies the hosting and page functionality.

Changes to this notice will be published here with a revised effective date. Contact protocolx76@gmail.com about a privacy concern or suspected security issue.

Provider privacy information: [Atlassian](https://www.atlassian.com/legal/privacy-policy) · [Google](https://policies.google.com/privacy).
