/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>'],
  testMatch: [
    '**/__tests__/**/*.test.ts',
    '**/__tests__/**/*.spec.ts',
    '**/*.test.ts',
    '**/*.spec.ts',
    '**/*.test.tsx',
    '**/*.spec.tsx'
  ],
  collectCoverageFrom: [
    'lib/**/*.ts',
    'app/**/*.ts',
    '!**/*.d.ts',
    '!**/node_modules/**',
    '!**/__tests__/**',
    '!**/*.test.ts',
    '!**/*.spec.ts'
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 80,
      lines: 80,
      statements: 80
    }
  },
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  testTimeout: 10000,
  // Transform Next.js specific files
  transform: {
    '^.+\\.(ts|tsx)$': ['ts-jest', {
      tsconfig: {
        jsx: 'react-jsx',
      },
    }],
  },
  // Handle module aliases
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
  // Ignore Next.js build output and other unnecessary files
  testPathIgnorePatterns: [
    '<rootDir>/.next/',
    '<rootDir>/node_modules/',
    '<rootDir>/coverage/',
    '<rootDir>/.vercel/',
    '<rootDir>/e2e/', // Playwright specs run via pnpm test:e2e, not Jest
    '<rootDir>/lib/e2b/__tests__', // Skip E2B integration tests (require E2B_API_KEY)
    '<rootDir>/lib/ai/__tests__/e2e', // Skip E2E agent tests (require API keys)
  ],
}
