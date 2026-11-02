<p align="center">
  <a href="https://github.com/microsoft/setup-WinAppCli/actions"><img alt="setup-WinAppCli status" src="https://github.com/microsoft/setup-WinAppCli/workflows/build-test/badge.svg"></a>
</p>

# Setup Windows App Developer CLI

This repository contains the source code for the `setup-WinAppCli` GitHub Action as well as the `setup-WinAppCli` Azure DevOps extension.

This action/extension sets up the [Windows App Developer CLI](https://github.com/microsoft/WinAppCli) on a runner/agent.
The Windows App Development CLI is a single command-line interface for managing Windows SDKs, packaging, generating app identity, manifests, certificates, and using build tools with any app framework.

Example (GitHub Action):
  
```yaml
name: WinApp CLI
on: [push]
jobs:
  build:
    runs-on: windows-latest
    steps:
    - uses: actions/checkout@v6
    - uses: microsoft/setup-WinAppCli@v0.1
    - run: winapp restore
```

Example (Azure DevOps extension):
  
```yaml
name: WinApp CLI
trigger:
- main
pool:
  vmImage: 'windows-latest'
steps:
- checkout: self
- task: UseWinAppCLI@0
- script: winapp restore
```

## Version input

For both GitHub Actions (`with.version`) and Azure DevOps (`inputs.version`),
`version` accepts `latest` (the default) or a release tag in the form
`vMAJOR.MINOR.PATCH`, optionally followed by a prerelease suffix such as
`v0.2.0-preview.1` or `v0.2.0-rc-1`. Prerelease components contain ASCII letters
and digits separated by dots or hyphens. Paths, URLs, query strings, fragments,
whitespace, and trailing newlines are rejected before downloading.
Only Windows x64 and arm64 are supported.

## Download verification

Both integrations verify the release ZIP's SHA-256 **before extraction**.
By default, the digest comes from the official repository's GitHub release API.
`latest` is resolved to a specific release tag before downloading. Missing or
invalid metadata, API failures (including rate limits), and digest mismatches
fail setup rather than installing unverified code.
GitHub Actions uses `github-token` (default: `${{ github.token }}`) for these API
requests to avoid the shared unauthenticated rate limit. Azure DevOps supports
the same optional input; supply a secret pipeline variable if needed. The token
is used only for the official release API, never for archive downloads.
Azure DevOps metadata requests honor the agent's proxy/bypass and CA/client
certificate settings. Metadata requests reject redirects and have a 30-second
deadline, including reading the response body.
The verified installation replaces an existing copy in the managed tool directory
so setup never silently reuses an older, unverified executable.

For stronger assurance, supply `sha256` with an independently obtained,
64-character hexadecimal digest for the runner's architecture, together with a
specific `version`. This avoids the release API lookup. In GitHub Actions these
are `with` inputs; in Azure DevOps they are task `inputs`. With `latest`, a
supplied digest must also match the resolved release metadata.

Release API digests detect corrupt or substituted downloads, but do not protect
against an attacker who can replace both an official release asset and its
metadata. A caller-pinned digest provides an independent trust anchor. Keep
version and digest inputs in trusted pipeline configuration.