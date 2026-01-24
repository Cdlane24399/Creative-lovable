import { name as templateAlias } from './package.json'
import { template } from './template'
import { config } from 'dotenv'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { defaultBuildLogger, Template } from 'e2b'

// Load .env.local from project root
const __dirname = dirname(fileURLToPath(import.meta.url))
config({ path: resolve(__dirname, '../../../.env.local') })

/**
 * Build production template
 * This is the template that will be used by the application
 */
Template.build(template, {
  alias: templateAlias,
  cpuCount: 4,
  memoryMB: 4096,
  onBuildLogs: defaultBuildLogger(),
})
