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
 * Build development template with '-dev' suffix
 * Use this for testing template changes before deploying to production
 */
Template.build(template, {
  alias: `${templateAlias}-dev`,
  cpuCount: 4,
  memoryMB: 4096,
  onBuildLogs: defaultBuildLogger(),
})
