/// <reference types="node" />

import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const MODELS_API_PATH = new URL('./models.ts', import.meta.url)

test('syncOpenAiCatalog uses an explicit long timeout for official catalog refreshes', async () => {
  const source = await readFile(MODELS_API_PATH, 'utf8')

  assert.match(
    source,
    /const OPENAI_CATALOG_SYNC_TIMEOUT_MS = 300_000/,
    'syncOpenAiCatalog should define a dedicated timeout budget for long-running official sync work',
  )
  assert.match(
    source,
    /syncOpenAiCatalog:\s*async[\s\S]*timeout:\s*OPENAI_CATALOG_SYNC_TIMEOUT_MS/,
    'syncOpenAiCatalog should override the 10s default timeout because catalog refresh is a long-running admin task',
  )
})
