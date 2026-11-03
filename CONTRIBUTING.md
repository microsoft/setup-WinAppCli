# Contributing

This project welcomes contributions and suggestions. Most contributions require you to
agree to a Contributor License Agreement (CLA) declaring that you have the right to,
and actually do, grant us the rights to use your contribution. For details, visit
https://cla.microsoft.com.

When you submit a pull request, a CLA-bot will automatically determine whether you need
to provide a CLA and decorate the PR appropriately (e.g., label, comment). Simply follow the
instructions provided by the bot. You will only need to do this once across all repositories using our CLA.

This project has adopted the [Microsoft Open Source Code of Conduct](https://opensource.microsoft.com/codeofconduct/).
For more information see the [Code of Conduct FAQ](https://opensource.microsoft.com/codeofconduct/faq/)
or contact [opencode@microsoft.com](mailto:opencode@microsoft.com) with any additional questions or comments.

## Releasing

This repository ships a GitHub Action and an Azure DevOps Marketplace extension.
They share source code, but publishing one does not publish the other.

1. Update `package.json`, both root package versions in `package-lock.json`,
   `setup-winappcli-task/task.json` (`Major`, `Minor`, and `Patch`), and
   `vss-extension.json` to the same new version. Update the README's GitHub Action
   example when introducing a new minor release line.
2. Restore dependencies from the lockfile, build, lint, test, and package the
   extension using the repository's npm scripts. Packaging requires `tfx-cli`.
   Commit any changed distributables with the version bump, and merge the pull
   request only after the build, test, and distributable consistency checks pass.
3. For the GitHub Action, create an immutable full-version tag (for example,
   `v0.3.0`) on the verified merged commit and publish a GitHub release with notes
   describing the changes and any compatibility considerations. Create or update
   the corresponding minor tag (for example, `v0.3`) to the same commit. Existing
   tags for other minor release lines should remain unchanged.
4. For the Azure DevOps extension, manually run
   [WinAppCLI(Setup) - CI](https://microsoft.visualstudio.com/pde-oss/_build?definitionId=184249),
   defined in `.pipelines/build.yml`, against that same commit with
   `DoEsrp=true`. The default
   is `false`, which does not sign the VSIX or include the publish stage. After
   the build, tests, and ESRP signing succeed, start the manual
   `PublishToMarketplace` stage to publish the signed `vsix` artifact. Do not
   substitute the unsigned VSIX from GitHub Actions.
5. Verify the GitHub release and tags resolve to the intended commit, and verify
   the new extension version is available in the
   [Marketplace](https://marketplace.visualstudio.com/items?itemName=ms-wpd-winappcli.windows-app-development-cli-setup-task).
   The Azure DevOps example continues to use `UseWinAppCLI@0` while the task's
   major version is zero.

## Distributable consistency

The consistency workflow rebuilds both shipped bundles using the pull request's
base revision's `build.mjs` (the current revision outside pull requests), without
npm lifecycle scripts or package build scripts, and compares `dist/` and
`setup-winappcli-task/` with the checked-in files. Both entrypoint bundles are
removed before rebuilding so stale files cannot satisfy the check.
The comparison also requires both bundles and the task's localized resources to
be tracked, so rebuilding cannot hide deleted runtime files.

Changes to the bundler may require a separate reviewed update before dependent
source changes. This check is not an authenticity guarantee: maintainers must
still review source, dependencies, build configuration, and workflow changes
before merging or releasing. It does not authenticate adversarial dependencies
or protect against a pull request modifying the workflow itself.