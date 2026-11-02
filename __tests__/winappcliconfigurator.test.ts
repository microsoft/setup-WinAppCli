import * as crypto from 'crypto'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import {afterEach, beforeEach, describe, expect, it, jest} from '@jest/globals'
import {
  getConfig,
  IPipeline,
  WinAppCLIConfigurator
} from '../src/winappcliconfigurator'

describe('verified release installation', () => {
  const originalPlatform = process.platform
  const originalArch = process.arch
  let directory: string
  let archive: string
  let digest: string
  let pipeline: IPipeline
  let fetchMock: jest.SpiedFunction<typeof fetch>

  beforeEach(() => {
    Object.defineProperty(process, 'platform', {value: 'win32'})
    Object.defineProperty(process, 'arch', {value: 'x64'})
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'winapp-verification-'))
    archive = path.join(directory, 'release.zip')
    fs.writeFileSync(archive, 'test release contents')
    digest = crypto
      .createHash('sha256')
      .update('test release contents')
      .digest('hex')
    pipeline = {
      debug: jest.fn<IPipeline['debug']>(),
      addPath: jest.fn<IPipeline['addPath']>(),
      mkdirP: jest.fn<IPipeline['mkdirP']>().mockResolvedValue(),
      downloadTool: jest
        .fn<IPipeline['downloadTool']>()
        .mockResolvedValue(archive),
      extractZip: jest
        .fn<IPipeline['extractZip']>()
        .mockResolvedValue('extracted'),
      rmRF: jest.fn<IPipeline['rmRF']>().mockResolvedValue(),
      moveSync: jest.fn<IPipeline['moveSync']>()
    }
    fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          tag_name: 'v0.1.8',
          assets: [{name: 'winappcli-x64.zip', digest: `sha256:${digest}`}]
        })
      )
    )
  })

  afterEach(() => {
    jest.restoreAllMocks()
    Object.defineProperty(process, 'platform', {value: originalPlatform})
    Object.defineProperty(process, 'arch', {value: originalArch})
    fs.rmSync(directory, {recursive: true, force: true})
  })

  it.each([
    '../../../ATTACKER/repo/releases/download/v1',
    '../../../../ATTACKER/repo/releases/download/v1',
    '..\\..\\ATTACKER\\repo',
    'v0.1.8/../../other',
    '%2e%2e%2fother',
    'v0.1.8%2fother',
    'v0.1.8?url=other',
    'v0.1.8#other',
    'https://example.com',
    'v0.1.8\n',
    'v0.1.8\r\n',
    ' v0.1.8',
    '0.1.8',
    ''
  ])(
    'rejects invalid version %j before any network or disk operation',
    async version => {
      await expect(
        new WinAppCLIConfigurator(version).configure(pipeline)
      ).rejects.toThrow('Invalid version')
      expect(fetchMock).not.toHaveBeenCalled()
      expect(pipeline.mkdirP).not.toHaveBeenCalled()
      expect(pipeline.downloadTool).not.toHaveBeenCalled()
    }
  )

  it.each(['v0.1.8', 'v0.2.0-preview.1', 'v0.2.0-rc-1'])(
    'supports pinned release %s without a metadata lookup',
    async version => {
      await getConfig(version, digest.toUpperCase()).configure(pipeline)
      expect(fetchMock).not.toHaveBeenCalled()
      expect(pipeline.downloadTool).toHaveBeenCalledWith(
        `https://github.com/microsoft/WinAppCli/releases/download/${version}/winappcli-x64.zip`
      )
      expect(pipeline.extractZip).toHaveBeenCalledWith(
        archive,
        expect.any(String)
      )
      expect(pipeline.moveSync).toHaveBeenCalledWith(
        'extracted',
        expect.any(String)
      )
      expect(pipeline.addPath).toHaveBeenCalledTimes(1)
      expect(pipeline.rmRF).toHaveBeenCalledWith(archive)
      expect(pipeline.rmRF).toHaveBeenCalledTimes(2)
    }
  )

  it('resolves the default latest release to a validated tag and asset digest', async () => {
    await getConfig('').configure(pipeline)
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.github.com/repos/microsoft/WinAppCli/releases/latest',
      expect.objectContaining({redirect: 'error'})
    )
    expect(pipeline.downloadTool).toHaveBeenCalledWith(
      'https://github.com/microsoft/WinAppCli/releases/download/v0.1.8/winappcli-x64.zip'
    )
    expect(pipeline.addPath).toHaveBeenCalledTimes(1)
  })

  it('verifies an explicit release against metadata by default', async () => {
    await getConfig('v0.1.8').configure(pipeline)
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.github.com/repos/microsoft/WinAppCli/releases/tags/v0.1.8',
      expect.any(Object)
    )
    expect(pipeline.extractZip).toHaveBeenCalledTimes(1)
  })

  it('selects and verifies the arm64 asset', async () => {
    Object.defineProperty(process, 'arch', {value: 'arm64'})
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          tag_name: 'v0.1.8',
          assets: [{name: 'winappcli-arm64.zip', digest: `sha256:${digest}`}]
        })
      )
    )
    await getConfig('latest').configure(pipeline)
    expect(pipeline.downloadTool).toHaveBeenCalledWith(
      expect.stringContaining('winappcli-arm64.zip')
    )
    expect(pipeline.extractZip).toHaveBeenCalledTimes(1)
  })

  it.each([
    '',
    'sha256:bad',
    `md5:${'a'.repeat(64)}`,
    `sha256:${'a'.repeat(64)}\n`,
    null
  ])(
    'fails closed for missing or invalid release digest %j',
    async releaseDigest => {
      fetchMock.mockResolvedValue(
        new Response(
          JSON.stringify({
            tag_name: 'v0.1.8',
            assets: [{name: 'winappcli-x64.zip', digest: releaseDigest}]
          })
        )
      )
      await expect(getConfig('latest').configure(pipeline)).rejects.toThrow(
        'Missing SHA-256'
      )
      expect(pipeline.downloadTool).not.toHaveBeenCalled()
    }
  )

  it.each([
    null,
    {},
    {tag_name: '../../../../ATTACKER/repo', assets: []},
    {tag_name: 'v0.1.8\n', assets: []},
    {tag_name: 'v0.1.8', assets: null},
    {tag_name: 'v0.1.9', assets: []}
  ])('rejects invalid or mismatched release metadata %j', async release => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify(release)))
    await expect(getConfig('v0.1.8').configure(pipeline)).rejects.toThrow(
      'Invalid WinAppCli release metadata'
    )
    expect(pipeline.downloadTool).not.toHaveBeenCalled()
  })

  it('rejects missing architecture assets', async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          tag_name: 'v0.1.8',
          assets: []
        })
      )
    )
    await expect(getConfig('latest').configure(pipeline)).rejects.toThrow(
      'Missing SHA-256'
    )
    expect(pipeline.downloadTool).not.toHaveBeenCalled()
  })

  it.each([403, 404, 429, 500])(
    'surfaces GitHub API status %s',
    async status => {
      fetchMock.mockResolvedValue(new Response('', {status}))
      await expect(getConfig('latest').configure(pipeline)).rejects.toThrow(
        `GitHub API returned ${status}`
      )
      expect(pipeline.downloadTool).not.toHaveBeenCalled()
    }
  )

  it('surfaces network failures without downloading an unverified asset', async () => {
    fetchMock.mockRejectedValue(new Error('network unavailable'))
    await expect(getConfig('latest').configure(pipeline)).rejects.toThrow(
      'network unavailable'
    )
    expect(pipeline.downloadTool).not.toHaveBeenCalled()
  })

  it.each(['bad', 'a'.repeat(63), 'g'.repeat(64), `${'a'.repeat(64)}\n`])(
    'rejects invalid caller digest %j before downloading',
    async pin => {
      await expect(
        getConfig('v0.1.8', pin).configure(pipeline)
      ).rejects.toThrow('Invalid sha256')
      expect(fetchMock).not.toHaveBeenCalled()
      expect(pipeline.downloadTool).not.toHaveBeenCalled()
    }
  )

  it('checks a latest pin against release metadata', async () => {
    await getConfig('latest', digest).configure(pipeline)
    expect(pipeline.extractZip).toHaveBeenCalledTimes(1)
  })

  it('rejects a latest pin that differs from release metadata', async () => {
    await expect(
      getConfig('latest', '0'.repeat(64)).configure(pipeline)
    ).rejects.toThrow('Pinned SHA-256')
    expect(pipeline.downloadTool).not.toHaveBeenCalled()
  })

  it('does not extract, install, or update PATH when archive verification fails', async () => {
    fs.writeFileSync(archive, 'tampered contents')
    await expect(
      getConfig('v0.1.8', digest).configure(pipeline)
    ).rejects.toThrow('SHA-256 verification failed')
    expect(pipeline.extractZip).not.toHaveBeenCalled()
    expect(pipeline.moveSync).not.toHaveBeenCalled()
    expect(pipeline.addPath).not.toHaveBeenCalled()
    expect(pipeline.rmRF).toHaveBeenCalledWith(archive)
    expect(pipeline.rmRF).toHaveBeenCalledTimes(2)
  })

  it('cleans the staging directory after a download failure', async () => {
    jest
      .mocked(pipeline.downloadTool)
      .mockRejectedValue(new Error('download failed'))
    await expect(
      getConfig('v0.1.8', digest).configure(pipeline)
    ).rejects.toThrow('download failed')
    expect(pipeline.rmRF).toHaveBeenCalledTimes(1)
    expect(pipeline.addPath).not.toHaveBeenCalled()
  })

  it('cleans the archive and staging directory after an extraction failure', async () => {
    jest
      .mocked(pipeline.extractZip)
      .mockRejectedValue(new Error('extraction failed'))
    await expect(
      getConfig('v0.1.8', digest).configure(pipeline)
    ).rejects.toThrow('extraction failed')
    expect(pipeline.rmRF).toHaveBeenCalledTimes(2)
    expect(pipeline.addPath).not.toHaveBeenCalled()
  })

  it('does not add the installation to PATH if moving it fails', async () => {
    jest.mocked(pipeline.moveSync).mockImplementation(() => {
      throw new Error('installation failed')
    })
    await expect(
      getConfig('v0.1.8', digest).configure(pipeline)
    ).rejects.toThrow('installation failed')
    expect(pipeline.rmRF).toHaveBeenCalledTimes(2)
    expect(pipeline.addPath).not.toHaveBeenCalled()
  })

  it('retains the platform restriction', async () => {
    Object.defineProperty(process, 'platform', {value: 'linux'})
    await expect(getConfig('latest').configure(pipeline)).rejects.toThrow(
      'Unsupported platform'
    )
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rejects unsupported architectures', async () => {
    Object.defineProperty(process, 'arch', {value: 'ia32'})
    await expect(getConfig('latest').configure(pipeline)).rejects.toThrow(
      'Unsupported architecture'
    )
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
