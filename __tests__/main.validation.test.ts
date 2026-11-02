import * as core from '@actions/core'
import * as io from '@actions/io'
import * as tc from '@actions/tool-cache'
import {afterEach, beforeEach, describe, expect, it, jest} from '@jest/globals'
import {run} from '../src/main'
import {WinAppCLIConfigurator} from '../src/winappcliconfigurator'

describe('GitHub Actions version input validation', () => {
  const platformDescriptor = Object.getOwnPropertyDescriptor(
    process,
    'platform'
  )!
  const archDescriptor = Object.getOwnPropertyDescriptor(process, 'arch')!
  const originalVersion = process.env.INPUT_VERSION

  beforeEach(() => {
    Object.defineProperty(process, 'platform', {value: 'win32'})
    Object.defineProperty(process, 'arch', {value: 'x64'})
    jest.spyOn(core, 'setFailed').mockImplementation(() => {})
    jest.spyOn(io, 'mkdirP').mockResolvedValue()
    jest
      .spyOn(tc, 'downloadTool')
      .mockRejectedValue(new Error('unexpected download'))
  })

  afterEach(() => {
    jest.restoreAllMocks()
    Object.defineProperty(process, 'platform', platformDescriptor)
    Object.defineProperty(process, 'arch', archDescriptor)
    if (originalVersion === undefined) {
      delete process.env.INPUT_VERSION
    } else {
      process.env.INPUT_VERSION = originalVersion
    }
  })

  it.each([
    'v0.1.8\n',
    'v0.1.8\r\n',
    ' v0.1.8',
    'v0.1.8 ',
    ' ',
    '\n',
    'latest\n'
  ])(
    'rejects raw input %j before filesystem or network operations',
    async version => {
      process.env.INPUT_VERSION = version

      await run()

      expect(core.setFailed).toHaveBeenCalledWith(
        'Invalid version: expected latest or a release tag such as v0.1.0'
      )
      expect(io.mkdirP).not.toHaveBeenCalled()
      expect(tc.downloadTool).not.toHaveBeenCalled()
    }
  )

  it.each(['', undefined, 'latest', 'v0.1.8', 'v0.2.0-preview.1'])(
    'preserves default and supported input %j',
    async version => {
      if (version === undefined) {
        delete process.env.INPUT_VERSION
      } else {
        process.env.INPUT_VERSION = version
      }
      let configuredVersion: string | undefined
      jest
        .spyOn(WinAppCLIConfigurator.prototype, 'configure')
        .mockImplementation(async function (this: WinAppCLIConfigurator) {
          this.validate()
          configuredVersion = this.version
        })

      await run()

      expect(configuredVersion).toBe(version || 'latest')
      expect(core.setFailed).not.toHaveBeenCalled()
    }
  )
})
