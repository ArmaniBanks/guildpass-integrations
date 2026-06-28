import { afterEach, test } from 'node:test'
import * as assert from 'node:assert/strict'
import { LiveAccessApi } from '../lib/api/live'
import { ApiError } from '../lib/api/errors'
import * as FIXTURES from './fixtures/live-api-responses'

function stubJson(data: unknown) {
  global.fetch = async () =>
    new Response(JSON.stringify(data), { status: 200 }) as any
}

function isValidationApiError(err: unknown): err is ApiError {
  return (
    err instanceof ApiError &&
    err.code === 'validation_error' &&
    err.safeMessage === 'Received an invalid response from the server.'
  )
}

afterEach(() => {
  delete (global as any).fetch
})

test('accepts valid live session responses before mapping', async () => {
  stubJson(FIXTURES.session)

  const session = await new LiveAccessApi('0xabc').getSession()

  assert.equal(session.address, '0xabc')
  assert.deepEqual(session.roles, ['member'])
  assert.equal(session.membership?.tier, 'free')
})

test('rejects invalid session roles safely', async () => {
  stubJson({ ...FIXTURES.session, roles: ['owner'] })

  await assert.rejects(
    () => new LiveAccessApi('0xabc').getSession(),
    isValidationApiError,
  )
})

test('rejects malformed JSON with a typed API error', async () => {
  global.fetch = async () =>
    new Response('{not-json', { status: 200 }) as any

  await assert.rejects(
    () => new LiveAccessApi().getCommunity(),
    isValidationApiError,
  )
})

test('rejects invalid membership tiers safely', async () => {
  stubJson({
    ...FIXTURES.session,
    membership: {
      address: '0xabc',
      membership_tier: 'enterprise',
      is_active: true,
    },
  })

  await assert.rejects(
    () => new LiveAccessApi('0xabc').getSession(),
    isValidationApiError,
  )
})

test('rejects malformed member arrays before mapping', async () => {
  stubJson({ members: FIXTURES.members })

  await assert.rejects(
    () => new LiveAccessApi().listMembers(),
    isValidationApiError,
  )
})

test('rejects member rows with missing required fields', async () => {
  stubJson([{ address: '0xabc', roles: ['member'], membership_tier: 'free' }])

  await assert.rejects(
    () => new LiveAccessApi().listMembers(),
    isValidationApiError,
  )
})

test('rejects invalid resource tier and role values', async () => {
  stubJson([
    {
      id: 'alpha',
      title: 'Alpha Docs',
      min_tier: 'elite',
      roles: ['member'],
    },
  ])

  await assert.rejects(
    () => new LiveAccessApi().listResources(),
    isValidationApiError,
  )

  stubJson([
    {
      id: 'alpha',
      title: 'Alpha Docs',
      min_tier: 'free',
      roles: ['owner'],
    },
  ])

  await assert.rejects(
    () => new LiveAccessApi().listResources(),
    isValidationApiError,
  )
})

test('rejects malformed policy arrays safely', async () => {
  stubJson({ policies: FIXTURES.policies })

  await assert.rejects(
    () => new LiveAccessApi().listPolicies(),
    isValidationApiError,
  )
})

test('rejects webhook events with unknown statuses', async () => {
  stubJson([
    {
      id: 'evt-1',
      event_type: 'membership.created',
      status: 'queued',
      created_at: '2026-06-27T00:00:00.000Z',
      affected_identifier: '0xabc',
      payload_summary: {},
    },
  ])

  await assert.rejects(
    () => new LiveAccessApi(undefined, 'token').listWebhookEvents(),
    isValidationApiError,
  )
})
