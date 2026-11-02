import * as path from 'path'
import * as os from 'os'
import * as crypto from 'crypto'
import * as fs from 'fs'

// Unlike $, the final assertion also rejects trailing line terminators.
const releaseVersion =
  /^v\d+\.\d+\.\d+(?:-[0-9A-Za-z]+(?:[.-][0-9A-Za-z]+)*)?(?![\s\S])/

export function getConfig(version: string): WinAppCLIConfigurator {
  return new WinAppCLIConfigurator(version || 'latest')
}

export interface IPipeline {
  debug(message: string): void
  addPath(p: string): void
  mkdirP(p: string): Promise<void>
  downloadTool(url: string): Promise<string>
  extractZip(archivePath: string, dest: string): Promise<string>
  rmRF(p: string): Promise<void>
  moveSync(downloadPath: string, toolPath: string): void
}

export class WinAppCLIConfigurator {
  version: string

  constructor(version: string) {
    this.version = version
  }

  async configure(pipeline: IPipeline): Promise<void> {
    this.validate()

    let versionString: string

    if (this.version === 'latest') {
      versionString = `latest/download`
    } else {
      versionString = `download/${this.version}`
    }

    const downloadURL = `https://github.com/microsoft/WinAppCli/releases/${versionString}/winappcli-${process.arch}.zip`

    pipeline.debug(`Downloading tool from ${downloadURL}`)
    const randomDir: string = crypto.randomUUID()
    const tempDir = path.join(os.tmpdir(), 'tmp', 'runner', randomDir)
    pipeline.debug(`Creating tempdir ${tempDir}`)
    await pipeline.mkdirP(tempDir)
    const downloadPath: string = await pipeline.downloadTool(downloadURL)

    const archivePath: string = await pipeline.extractZip(downloadPath, tempDir)

    await this.moveToPath(archivePath, 'winapp.exe', pipeline)

    return pipeline.rmRF(tempDir)
  }

  async moveToPath(
    downloadPath: string,
    name: string,
    pipeline: IPipeline
  ): Promise<void> {
    const toolPath = binPath()
    await pipeline.mkdirP(toolPath)

    const dest = path.join(toolPath, name)
    if (!fs.existsSync(dest)) {
      pipeline.moveSync(downloadPath, toolPath)
    }

    pipeline.addPath(toolPath)
  }

  validate(): void {
    if (process.platform !== 'win32') {
      throw new Error(`Unsupported platform: ${process.platform}`)
    }
    if (this.version !== 'latest' && !releaseVersion.test(this.version)) {
      throw new Error(
        'Invalid version: expected latest or a release tag such as v0.1.0'
      )
    }
    if (process.arch !== 'x64' && process.arch !== 'arm64') {
      throw new Error(`Unsupported architecture: ${process.arch}`)
    }
  }
}

export function binPath(): string {
  const baseLocation: string = process.env['USERPROFILE'] || 'C:\\'

  return path.join(baseLocation, os.userInfo().username, 'winapp')
}
