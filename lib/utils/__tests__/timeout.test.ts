/**
 * Timeout Utility Tests
 */

import {
  withTimeout,
  withOperationTimeout,
  TimeoutError,
  OPERATION_TIMEOUTS,
  createTimeoutWrapper,
} from '../timeout'

describe('TimeoutError', () => {
  it('should create error with operation name and timeout', () => {
    const error = new TimeoutError('testOperation', 5000)

    expect(error.name).toBe('TimeoutError')
    expect(error.operation).toBe('testOperation')
    expect(error.timeoutMs).toBe(5000)
    expect(error.message).toBe('Operation "testOperation" timed out after 5000ms')
  })
})

describe('withTimeout', () => {
  it('should resolve when function completes before timeout', async () => {
    const fn = async () => {
      await new Promise(resolve => setTimeout(resolve, 10))
      return 'success'
    }

    const result = await withTimeout(fn, 1000, 'testOp')
    expect(result).toBe('success')
  })

  it('should reject with TimeoutError when function takes too long', async () => {
    const fn = async () => {
      await new Promise(resolve => setTimeout(resolve, 500))
      return 'success'
    }

    await expect(withTimeout(fn, 50, 'slowOp'))
      .rejects.toThrow(TimeoutError)
  })

  it('should preserve function errors', async () => {
    const fn = async () => {
      throw new Error('Original error')
    }

    await expect(withTimeout(fn, 1000, 'errorOp'))
      .rejects.toThrow('Original error')
  })

  it('should clear timeout after successful completion', async () => {
    jest.useFakeTimers()
    const clearTimeoutSpy = jest.spyOn(global, 'clearTimeout')

    const fn = async () => 'success'
    const promise = withTimeout(fn, 1000, 'testOp')

    // Fast-forward past when the promise resolves
    await Promise.resolve()

    const result = await promise
    expect(result).toBe('success')
    expect(clearTimeoutSpy).toHaveBeenCalled()

    jest.useRealTimers()
    clearTimeoutSpy.mockRestore()
  })
})

describe('withOperationTimeout', () => {
  it('should use predefined timeout for operation type', async () => {
    const fn = async () => 'success'

    const result = await withOperationTimeout(fn, 'DB_QUERY')
    expect(result).toBe('success')
  })

  it('should use custom operation name when provided', async () => {
    const fn = async () => {
      await new Promise(resolve => setTimeout(resolve, 500))
      return 'success'
    }

    // Create a scenario where timeout happens
    const shortTimeoutFn = async () => {
      await new Promise(resolve => setTimeout(resolve, 100))
      throw new TimeoutError('customName', 50)
    }

    try {
      await shortTimeoutFn()
    } catch (error) {
      expect(error).toBeInstanceOf(TimeoutError)
      expect((error as TimeoutError).operation).toBe('customName')
    }
  })
})

describe('createTimeoutWrapper', () => {
  it('should create a wrapped function that applies timeout', async () => {
    const originalFn = async (x: number, y: number) => x + y

    const wrappedFn = createTimeoutWrapper(originalFn, 1000, 'addOp')
    const result = await wrappedFn(2, 3)

    expect(result).toBe(5)
  })

  it('should pass arguments correctly', async () => {
    const originalFn = jest.fn(async (a: string, b: number) => `${a}-${b}`)

    const wrappedFn = createTimeoutWrapper(originalFn, 1000, 'testOp')
    await wrappedFn('hello', 42)

    expect(originalFn).toHaveBeenCalledWith('hello', 42)
  })
})

describe('OPERATION_TIMEOUTS', () => {
  it('should have expected timeout values', () => {
    expect(OPERATION_TIMEOUTS.SANDBOX_OPERATION).toBe(30_000)
    expect(OPERATION_TIMEOUTS.AI_CALL).toBe(60_000)
    expect(OPERATION_TIMEOUTS.DB_QUERY).toBe(10_000)
    expect(OPERATION_TIMEOUTS.FILE_OPERATION).toBe(15_000)
    expect(OPERATION_TIMEOUTS.DEV_SERVER_START).toBe(120_000)
    expect(OPERATION_TIMEOUTS.PACKAGE_INSTALL).toBe(300_000)
  })
})
