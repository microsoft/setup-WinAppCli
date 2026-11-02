import * as path from 'path'
import * as os from 'os'
import * as crypto from 'crypto'
import * as fs from 'fs'

// Unlike $, the final assertion also rejects trailing line terminators.
const releaseVersion =
  /^v\d+\.\d+\.\d+(?:-[0-9A-Za-z]+(?:[.-][0-9A-Za-z]+)*)?(?![\s\S])/
const sha256Digest = /^[a-fA-F0-9]{64}(?![\s\S])/

export function getConfig(version: string, sha256 = ''): WinAppCLIConfigurator {
  return new WinAppCLIConfigurator(version || 'latest', sha256)
}

export interface IPipeline {
  getRelease(url: string): Promise<unknown>
  debug(message: string): void
  addPath(p: string): void
  mkdirP(p: string): Promise<void>
  downloadTool(url: string): Promise<string>
  extractZip(archivePath: string, dest: string): Promise<string>
  rmRF(p: string): Promise<void>
  moveSync(downloadPath: string, toolPath: string): void
}

type ReleaseRequest = (
  url: string,
  options: {
    headers: Record<string, string>
    redirect: 'error'
    signal: AbortSignal
  }
) => Promise<
  Pick<Response, 'ok' | 'status' | 'text'> & {
    headers: Pick<Headers, 'get'>
  }
>

export async function fetchRelease(
  url: string,
  token = '',
  request: ReleaseRequest = fetch
): Promise<unknown> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'setup-WinAppCli',
    'X-GitHub-Api-Version': '2022-11-28'
  }
  if (token) headers.Authorization = `Bearer ${token}`
  const response = await request(url, {
    headers,
    redirect: 'error',
    signal: AbortSignal.timeout(30000)
  })
  const body = await response.text()
  if (!response.ok) {
    const rateLimited = response.headers.get('x-ratelimit-remaining') === '0'
    throw new Error(
      `Unable to resolve WinAppCli release: GitHub API returned ${response.status}${rateLimited ? ' (API rate limit exceeded)' : ''}`
    )
  }
  return JSON.parse(body)
}

export class WinAppCLIConfigurator {
  version: string

  constructor(
    version: string,
    readonly sha256 = ''
  ) {
    this.version = version
  }

  async configure(pipeline: IPipeline): Promise<void> {
    this.validate()

    const assetName = `winappcli-${process.arch}.zip`
    const {version, digest} = await this.resolveRelease(assetName, pipeline)
    const downloadURL = `https://github.com/microsoft/WinAppCli/releases/download/${version}/${assetName}`

    pipeline.debug(`Downloading tool from ${downloadURL}`)
    const randomDir: string = crypto.randomUUID()
    const tempDir = path.join(os.tmpdir(), 'tmp', 'runner', randomDir)
    pipeline.debug(`Creating tempdir ${tempDir}`)
    let downloadPath: string | undefined
    try {
      await pipeline.mkdirP(tempDir)
      downloadPath = await pipeline.downloadTool(downloadURL)
      const hash = crypto.createHash('sha256')
      for await (const chunk of fs.createReadStream(downloadPath)) {
        hash.update(chunk)
      }
      if (hash.digest('hex') !== digest) {
        throw new Error(`SHA-256 verification failed for ${assetName}`)
      }
      const archivePath = await pipeline.extractZip(downloadPath, tempDir)
      await this.moveToPath(archivePath, pipeline)
    } finally {
      try {
        if (downloadPath) await pipeline.rmRF(downloadPath)
      } finally {
        await pipeline.rmRF(tempDir)
      }
    }
  }

  private async resolveRelease(
    assetName: string,
    pipeline: IPipeline
  ): Promise<{version: string; digest: string}> {
    // A caller-pinned digest does not depend on mutable release metadata.
    if (this.sha256 && this.version !== 'latest') {
      return {version: this.version, digest: this.sha256.toLowerCase()}
    }
    const releasePath =
      this.version === 'latest' ? 'latest' : `tags/${this.version}`
    const release = await pipeline.getRelease(
      `https://api.github.com/repos/microsoft/WinAppCli/releases/${releasePath}`
    )
    if (
      typeof release !== 'object' ||
      release === null ||
      !('tag_name' in release) ||
      typeof release.tag_name !== 'string' ||
      !releaseVersion.test(release.tag_name) ||
      (this.version !== 'latest' && release.tag_name !== this.version) ||
      !('assets' in release) ||
      !Array.isArray(release.assets)
    ) {
      throw new Error('Invalid WinAppCli release metadata')
    }
    const assets: unknown[] = release.assets
    const asset = assets.find(
      asset =>
        typeof asset === 'object' &&
        asset !== null &&
        'name' in asset &&
        asset.name === assetName
    )
    if (
      typeof asset !== 'object' ||
      asset === null ||
      !('digest' in asset) ||
      typeof asset.digest !== 'string' ||
      !asset.digest.startsWith('sha256:') ||
      !sha256Digest.test(asset.digest.slice('sha256:'.length))
    ) {
      throw new Error(`Missing SHA-256 release digest for ${assetName}`)
    }
    const digest = asset.digest.slice('sha256:'.length).toLowerCase()
    if (this.sha256 && this.sha256.toLowerCase() !== digest) {
      throw new Error('Pinned SHA-256 does not match the release asset digest')
    }
    return {version: release.tag_name, digest}
  }

  async moveToPath(downloadPath: string, pipeline: IPipeline): Promise<void> {
    const toolPath = binPath()
    await pipeline.mkdirP(toolPath)

    pipeline.moveSync(downloadPath, toolPath)
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
    if (this.sha256 && !sha256Digest.test(this.sha256)) {
      throw new Error('Invalid sha256: expected 64 hexadecimal characters')
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
