import {afterEach, beforeEach, describe, expect, it, jest} from '@jest/globals'
import {
  getConfig,
  IPipeline,
  WinAppCLIConfigurator
} from '../src/winappcliconfigurator'

jest.mock('fs', () => ({existsSync: jest.fn(() => false)}))

describe('release version validation', () => {
  const platformDescriptor = Object.getOwnPropertyDescriptor(
    process,
    'platform'
  )!
  const archDescriptor = Object.getOwnPropertyDescriptor(process, 'arch')!
  let pipeline: IPipeline

  beforeEach(() => {
    Object.defineProperty(process, 'platform', {value: 'win32'})
    Object.defineProperty(process, 'arch', {value: 'x64'})
    pipeline = {
      debug: jest.fn<IPipeline['debug']>(),
      addPath: jest.fn<IPipeline['addPath']>(),
      mkdirP: jest.fn<IPipeline['mkdirP']>().mockResolvedValue(),
      downloadTool: jest
        .fn<IPipeline['downloadTool']>()
        .mockResolvedValue('release.zip'),
      extractZip: jest
        .fn<IPipeline['extractZip']>()
        .mockResolvedValue('extracted'),
      rmRF: jest.fn<IPipeline['rmRF']>().mockResolvedValue(),
      moveSync: jest.fn<IPipeline['moveSync']>()
    }
  })

  afterEach(() => {
    Object.defineProperty(process, 'platform', platformDescriptor)
    Object.defineProperty(process, 'arch', archDescriptor)
  })

  function expectNoPipelineOperations(): void {
    for (const operation of Object.values(pipeline)) {
      expect(operation).not.toHaveBeenCalled()
    }
  }

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
    'v0.1.8\r',
    'v0.1.8\u2028',
    'v0.1.8\u2029',
    'latest\n',
    ' v0.1.8',
    'v0.1.8 ',
    '0.1.8',
    'v0.1',
    'v0.1.8-',
    'v0.1.8-preview..1',
    'v0.1.8-preview_1',
    'v0.1.8+build.1',
    ''
  ])(
    'rejects invalid version %j before any pipeline operation',
    async version => {
      await expect(
        new WinAppCLIConfigurator(version).configure(pipeline)
      ).rejects.toThrow('Invalid version')
      expectNoPipelineOperations()
    }
  )

  it.each(['v0.1.8', 'v0.2.0-preview.1', 'v0.2.0-rc-1'])(
    'preserves the release download and installation flow for %s',
    async version => {
      await getConfig(version).configure(pipeline)
      expect(pipeline.downloadTool).toHaveBeenCalledWith(
        `https://github.com/microsoft/WinAppCli/releases/download/${version}/winappcli-x64.zip`
      )
      expect(pipeline.extractZip).toHaveBeenCalledWith(
        'release.zip',
        expect.any(String)
      )
      expect(pipeline.moveSync).toHaveBeenCalledWith(
        'extracted',
        expect.any(String)
      )
      expect(pipeline.addPath).toHaveBeenCalledTimes(1)
      expect(pipeline.rmRF).toHaveBeenCalledTimes(1)
    }
  )

  it.each(['latest', ''])(
    'preserves the latest download URL for input %j',
    async version => {
      await getConfig(version).configure(pipeline)
      expect(pipeline.downloadTool).toHaveBeenCalledWith(
        'https://github.com/microsoft/WinAppCli/releases/latest/download/winappcli-x64.zip'
      )
      expect(pipeline.addPath).toHaveBeenCalledTimes(1)
    }
  )

  it('selects the arm64 asset', async () => {
    Object.defineProperty(process, 'arch', {value: 'arm64'})
    await getConfig('v0.1.8').configure(pipeline)
    expect(pipeline.downloadTool).toHaveBeenCalledWith(
      'https://github.com/microsoft/WinAppCli/releases/download/v0.1.8/winappcli-arm64.zip'
    )
  })

  it.each(['linux', 'darwin'])(
    'retains the platform restriction for %s',
    async platform => {
      Object.defineProperty(process, 'platform', {value: platform})
      await expect(getConfig('latest').configure(pipeline)).rejects.toThrow(
        `Unsupported platform: ${platform}`
      )
      expectNoPipelineOperations()
    }
  )

  it.each(['ia32', 'arm', 'riscv64'])(
    'rejects unsupported architecture %s before any pipeline operation',
    async arch => {
      Object.defineProperty(process, 'arch', {value: arch})
      await expect(getConfig('latest').configure(pipeline)).rejects.toThrow(
        `Unsupported architecture: ${arch}`
      )
      expectNoPipelineOperations()
    }
  )
})
