/**
 * Logger Unit Tests
 */

import { Logger, logger, createRequestLogger, debug, info, warn, error } from '../logger'

describe('Logger', () => {
  let consoleLogSpy: jest.SpyInstance
  let consoleWarnSpy: jest.SpyInstance
  let consoleErrorSpy: jest.SpyInstance

  beforeEach(() => {
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation()
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation()
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation()
  })

  afterEach(() => {
    consoleLogSpy.mockRestore()
    consoleWarnSpy.mockRestore()
    consoleErrorSpy.mockRestore()
  })

  describe('Logger class', () => {
    it('should create logger with context', () => {
      const log = new Logger({ requestId: 'test-123' })
      log.info('Test message')

      expect(consoleLogSpy).toHaveBeenCalled()
      const output = consoleLogSpy.mock.calls[0][0]
      expect(output).toContain('Test message')
    })

    it('should create child logger with merged context', () => {
      const parent = new Logger({ requestId: 'req-123' })
      const child = parent.child({ userId: 'user-456' })

      child.info('Child message')

      expect(consoleLogSpy).toHaveBeenCalled()
      const output = consoleLogSpy.mock.calls[0][0]
      expect(output).toContain('Child message')
    })

    it('should log at debug level', () => {
      const log = new Logger()
      log.debug('Debug message')

      expect(consoleLogSpy).toHaveBeenCalled()
    })

    it('should log at info level', () => {
      const log = new Logger()
      log.info('Info message')

      expect(consoleLogSpy).toHaveBeenCalled()
    })

    it('should log at warn level', () => {
      const log = new Logger()
      log.warn('Warn message')

      expect(consoleWarnSpy).toHaveBeenCalled()
    })

    it('should log at error level', () => {
      const log = new Logger()
      log.error('Error message')

      expect(consoleErrorSpy).toHaveBeenCalled()
    })

    it('should include error details when provided', () => {
      const log = new Logger()
      const testError = new Error('Test error')

      log.error('Something failed', {}, testError)

      expect(consoleErrorSpy).toHaveBeenCalled()
      const output = consoleErrorSpy.mock.calls[0][0]
      expect(output).toContain('Something failed')
      expect(output).toContain('Test error')
    })
  })

  describe('time helper', () => {
    it('should time async operations', async () => {
      const log = new Logger()
      
      const result = await log.time(
        'test-operation',
        async () => {
          await new Promise(resolve => setTimeout(resolve, 10))
          return 'completed'
        }
      )

      expect(result).toBe('completed')
      expect(consoleLogSpy).toHaveBeenCalled()
      const output = consoleLogSpy.mock.calls[0][0]
      expect(output).toContain('test-operation completed')
    })

    it('should log error when operation fails', async () => {
      const log = new Logger()
      
      await expect(
        log.time('failing-op', async () => {
          throw new Error('Operation failed')
        })
      ).rejects.toThrow('Operation failed')

      expect(consoleErrorSpy).toHaveBeenCalled()
      const output = consoleErrorSpy.mock.calls[0][0]
      expect(output).toContain('failing-op failed')
    })
  })

  describe('timeSync helper', () => {
    it('should time sync operations', () => {
      const log = new Logger()
      
      const result = log.timeSync('sync-operation', () => {
        return 'sync-result'
      })

      expect(result).toBe('sync-result')
      expect(consoleLogSpy).toHaveBeenCalled()
    })
  })

  describe('convenience functions', () => {
    it('debug should log at debug level', () => {
      debug('Debug via function')
      expect(consoleLogSpy).toHaveBeenCalled()
    })

    it('info should log at info level', () => {
      info('Info via function')
      expect(consoleLogSpy).toHaveBeenCalled()
    })

    it('warn should log at warn level', () => {
      warn('Warn via function')
      expect(consoleWarnSpy).toHaveBeenCalled()
    })

    it('error should log at error level', () => {
      error('Error via function')
      expect(consoleErrorSpy).toHaveBeenCalled()
    })
  })

  describe('createRequestLogger', () => {
    it('should create logger with requestId', () => {
      const log = createRequestLogger('req-abc-123')
      log.info('Request log')

      expect(consoleLogSpy).toHaveBeenCalled()
      const output = consoleLogSpy.mock.calls[0][0]
      expect(output).toContain('Request log')
    })
  })

  describe('default logger instance', () => {
    it('should be available', () => {
      expect(logger).toBeInstanceOf(Logger)
    })
  })
})
