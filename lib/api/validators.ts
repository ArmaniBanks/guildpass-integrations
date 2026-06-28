import { ApiError } from './errors'
import type {
  BackendMember,
  BackendPolicy,
  BackendResource,
  BackendSession,
  Membership,
  MembershipTier,
  Role,
  WebhookEventLog,
  WebhookEventStatus,
  WebhookEventType,
} from './types'

const ROLES: readonly Role[] = ['member', 'moderator', 'admin']
const TIERS: readonly MembershipTier[] = ['free', 'standard', 'pro']
const WEBHOOK_EVENT_TYPES: readonly WebhookEventType[] = [
  'membership.created',
  'membership.renewed',
  'membership.expired',
  'tier.upgraded',
  'policy.updated',
]
const WEBHOOK_EVENT_STATUSES: readonly WebhookEventStatus[] = [
  'success',
  'failed',
  'pending',
]

function invalidResponse(path: string, reason: string): ApiError {
  return new ApiError({
    code: 'validation_error',
    safeMessage: 'Received an invalid response from the server.',
    path,
    details: { reason },
  })
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function assertObject(
  value: unknown,
  path: string,
  label: string,
): asserts value is Record<string, unknown> {
  if (!isObject(value)) {
    throw invalidResponse(path, `${label} must be an object.`)
  }
}

function assertString(value: unknown, path: string, label: string): void {
  if (typeof value !== 'string') {
    throw invalidResponse(path, `${label} must be a string.`)
  }
}

function assertOptionalString(
  value: unknown,
  path: string,
  label: string,
): void {
  if (value !== undefined && typeof value !== 'string') {
    throw invalidResponse(path, `${label} must be a string.`)
  }
}

function assertBoolean(value: unknown, path: string, label: string): void {
  if (typeof value !== 'boolean') {
    throw invalidResponse(path, `${label} must be a boolean.`)
  }
}

function assertStringArray(value: unknown, path: string, label: string): void {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw invalidResponse(path, `${label} must be an array of strings.`)
  }
}

function assertEnum<T extends string>(
  value: unknown,
  allowed: readonly T[],
  path: string,
  label: string,
): asserts value is T {
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    throw invalidResponse(path, `${label} is not supported.`)
  }
}

function assertEnumArray<T extends string>(
  value: unknown,
  allowed: readonly T[],
  path: string,
  label: string,
): void {
  if (!Array.isArray(value)) {
    throw invalidResponse(path, `${label} must be an array.`)
  }

  for (const item of value) {
    assertEnum(item, allowed, path, `${label} item`)
  }
}

function firstDefined(...values: unknown[]): unknown {
  return values.find((value) => value !== undefined)
}

function validateCommunityObject(raw: unknown, path: string): void {
  assertObject(raw, path, 'community')
  assertString(raw.id, path, 'community.id')
  assertString(raw.name, path, 'community.name')
  assertOptionalString(raw.description, path, 'community.description')
  assertEnumArray(raw.tiers, TIERS, path, 'community.tiers')
}

function validateBackendMembership(raw: unknown, path: string): void {
  assertObject(raw, path, 'membership')
  assertString(
    firstDefined(raw.address, raw.wallet_address),
    path,
    'membership.address',
  )
  assertEnum(
    firstDefined(raw.tier, raw.membership_tier),
    TIERS,
    path,
    'membership.tier',
  )
  assertBoolean(
    firstDefined(raw.active, raw.is_active),
    path,
    'membership.active',
  )
  assertOptionalString(
    firstDefined(raw.expiresAt, raw.expires_at),
    path,
    'membership.expiresAt',
  )
}

function validatePayloadSummary(raw: unknown, path: string): void {
  if (raw === undefined) return

  assertObject(raw, path, 'webhook payload summary')
  assertOptionalString(raw.network, path, 'payloadSummary.network')
  assertOptionalString(
    firstDefined(raw.txHash, raw.tx_hash),
    path,
    'payloadSummary.txHash',
  )
  assertOptionalString(raw.tier, path, 'payloadSummary.tier')
  assertOptionalString(raw.reason, path, 'payloadSummary.reason')
}

export function validateSessionResponse(
  raw: unknown,
  path: string,
): asserts raw is BackendSession {
  assertObject(raw, path, 'session')
  assertOptionalString(
    firstDefined(raw.address, raw.wallet_address),
    path,
    'session.address',
  )
  assertEnumArray(raw.roles, ROLES, path, 'session.roles')

  if (raw.membership !== undefined) {
    validateBackendMembership(raw.membership, path)
  }

  if (raw.community !== undefined) {
    validateCommunityObject(raw.community, path)
  }
}

export function validateCommunityResponse(
  raw: unknown,
  path: string,
): asserts raw is BackendSession['community'] {
  validateCommunityObject(raw, path)
}

export function validateMembershipResponse(
  raw: unknown,
  path: string,
): asserts raw is Membership | null {
  if (raw === null) return

  assertObject(raw, path, 'membership')
  assertString(raw.address, path, 'membership.address')
  assertEnum(raw.tier, TIERS, path, 'membership.tier')
  assertBoolean(raw.active, path, 'membership.active')
  assertOptionalString(raw.expiresAt, path, 'membership.expiresAt')
}

export function validateMemberProfileResponse(raw: unknown, path: string): void {
  if (raw === null) return

  assertObject(raw, path, 'member profile')
  assertOptionalString(
    firstDefined(raw.displayName, raw.display_name, raw.username),
    path,
    'member profile display name',
  )
  assertOptionalString(raw.bio, path, 'member profile.bio')
  assertStringArray(raw.badges, path, 'member profile.badges')
}

export function validateMemberRowsResponse(
  raw: unknown,
  path: string,
): asserts raw is BackendMember[] {
  if (!Array.isArray(raw)) {
    throw invalidResponse(path, 'members must be an array.')
  }

  raw.forEach((member, index) => {
    assertObject(member, path, `members[${index}]`)
    assertString(
      firstDefined(member.address, member.wallet_address),
      path,
      `members[${index}].address`,
    )
    assertEnumArray(member.roles, ROLES, path, `members[${index}].roles`)
    assertEnum(
      firstDefined(member.tier, member.membership_tier),
      TIERS,
      path,
      `members[${index}].tier`,
    )
    assertBoolean(
      firstDefined(member.active, member.is_active),
      path,
      `members[${index}].active`,
    )
  })
}

export function validateResourcesResponse(
  raw: unknown,
  path: string,
): asserts raw is BackendResource[] {
  if (!Array.isArray(raw)) {
    throw invalidResponse(path, 'resources must be an array.')
  }

  raw.forEach((resource, index) => {
    assertObject(resource, path, `resources[${index}]`)
    assertString(resource.id, path, `resources[${index}].id`)
    assertString(
      firstDefined(resource.title, resource.name),
      path,
      `resources[${index}].title`,
    )
    assertOptionalString(
      resource.description,
      path,
      `resources[${index}].description`,
    )

    const minTier = firstDefined(resource.minTier, resource.min_tier)
    if (minTier !== undefined) {
      assertEnum(minTier, TIERS, path, `resources[${index}].minTier`)
    }

    if (resource.roles !== undefined) {
      assertEnumArray(resource.roles, ROLES, path, `resources[${index}].roles`)
    }
  })
}

export function validatePoliciesResponse(
  raw: unknown,
  path: string,
): asserts raw is BackendPolicy[] {
  if (!Array.isArray(raw)) {
    throw invalidResponse(path, 'policies must be an array.')
  }

  raw.forEach((policy, index) => {
    assertObject(policy, path, `policies[${index}]`)
    assertString(
      firstDefined(policy.resourceId, policy.resource_id),
      path,
      `policies[${index}].resourceId`,
    )

    const minTier = firstDefined(policy.minTier, policy.min_tier)
    if (minTier !== undefined) {
      assertEnum(minTier, TIERS, path, `policies[${index}].minTier`)
    }

    if (policy.roles !== undefined) {
      assertEnumArray(policy.roles, ROLES, path, `policies[${index}].roles`)
    }
  })
}

export function validateWebhookEventsResponse(
  raw: unknown,
  path: string,
): asserts raw is WebhookEventLog[] {
  if (!Array.isArray(raw)) {
    throw invalidResponse(path, 'webhook events must be an array.')
  }

  raw.forEach((event, index) => {
    assertObject(event, path, `webhookEvents[${index}]`)
    assertString(event.id, path, `webhookEvents[${index}].id`)
    assertEnum(
      firstDefined(event.eventType, event.event_type),
      WEBHOOK_EVENT_TYPES,
      path,
      `webhookEvents[${index}].eventType`,
    )
    assertEnum(
      event.status,
      WEBHOOK_EVENT_STATUSES,
      path,
      `webhookEvents[${index}].status`,
    )
    assertString(
      firstDefined(event.timestamp, event.created_at),
      path,
      `webhookEvents[${index}].timestamp`,
    )
    assertString(
      firstDefined(event.affectedIdentifier, event.affected_identifier),
      path,
      `webhookEvents[${index}].affectedIdentifier`,
    )
    validatePayloadSummary(
      firstDefined(event.payloadSummary, event.payload_summary),
      path,
    )
  })
}
