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