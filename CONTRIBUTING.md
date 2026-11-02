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