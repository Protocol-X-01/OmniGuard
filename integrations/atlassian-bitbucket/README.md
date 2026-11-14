# OmniGuard Bitbucket scaffold

This scaffold is intended to be registered as a separate Forge app; its manifest still contains a placeholder app ID. Atlassian currently supports Jira and Confluence in its multiple-app compatibility model; the active Jira app therefore has its own manifest and storage boundary.

This scaffold declares the pull request overview panel and shows its implementation status. It does not fetch repository source, claim a scan of the open pull request, or create Jira issues. Before enabling those features, bind a scan bundle to a repository UUID, pull request and commit, and design an authenticated transfer to the Jira app.

To activate later: install this package's dependencies, register it once with its own app ID, deploy to development and install on an authorized Bitbucket workspace. Do not reuse the Jira app's ID.

[Atlassian app compatibility](https://developer.atlassian.com/platform/forge/app-compatibility/)
