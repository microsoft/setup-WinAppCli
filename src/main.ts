import * as core from '@actions/core'
import * as tc from '@actions/tool-cache'
import * as io from '@actions/io'
import * as winappcliconfigurator from './winappcliconfigurator'
import * as fs from 'fs-extra'

const Version = 'version'

class GitHubPipeline implements winappcliconfigurator.IPipeline {
  debug(message: string): void {
    core.debug(message)
  }
  addPath(p: string): void {
    core.addPath(p)
  }
  async mkdirP(p: string): Promise<void> {
    return io.mkdirP(p)
  }
  async downloadTool(url: string): Promise<string> {
    return tc.downloadTool(url)
  }
  async extractZip(archivePath: string, dest: string): Promise<string> {
    return tc.extractZip(archivePath, dest)
  }
  async rmRF(p: string): Promise<void> {
    return io.rmRF(p)
  }
  moveSync(downloadPath: string, toolPath: string): void {
    fs.moveSync(downloadPath, toolPath, {overwrite: true})
  }
}

export async function run(): Promise<void> {
  try {
    await winappcliconfigurator
      .getConfig(core.getInput(Version))
      .configure(new GitHubPipeline())
  } catch (error) {
    if (error instanceof Error) core.setFailed(error.message)
  }
}

// Only run when this file is executed directly, not when imported
if (require.main === module) {
  run()
}
