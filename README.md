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

## Download verification

`version` accepts `latest` (the default) or a release tag such as `v0.1.8`
or `v0.2.0-preview.1`. Paths, URLs, query strings, and fragments are rejected.
Only Windows x64 and arm64 are supported.

Both integrations verify the release ZIP's SHA-256 **before extraction**.
By default, the digest comes from the official repository's GitHub release API.
`latest` is resolved to a specific release tag before downloading. Missing or
invalid metadata, API failures (including rate limits), and digest mismatches
fail setup rather than installing unverified code.
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

## Distributable consistency

The consistency workflow rebuilds both shipped bundles using the base revision's
bundler, without npm lifecycle scripts, and compares the generated files. Changes
to the bundler may require a separate reviewed update before dependent source
changes. This check is not an authenticity guarantee: maintainers must still
review source, dependencies, build configuration, and workflow changes before
merging or releasing.