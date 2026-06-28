/**
 * lib/api/mock.ts
 *
 * In-memory mock API for local development and testing.
 * All existing member/resource/policy data and mutation logic is preserved.
 *
 * SIWE additions:
 * - getNonce()    — returns a random hex string (no real cryptography needed)
 * - siweVerify()  — immediately returns a mock SiweAuthSession with a 1-hour
 * expiry WITHOUT verifying the signature. This lets developers
 * work in mock mode without MetaMask.
 * - siweLogout()  — no-op that resolves immediately.
 *
 * Session simulation:
 *  Set NEXT_PUBLIC_MOCK_SESSION_STATE to control the simulated auth boundary:
 *    "expired"         — siweVerify returns an already-expired token; admin
 *                        mutations (assignRole/updatePolicy) throw a 401 ApiError
 *    "unauthenticated" — siweVerify always throws, simulating a backend rejection
 *    (default)         — normal mock behaviour (instant auth, 1-hour token)
 *
 * The mock MOCK_ADMIN_ADDRESS constant seeds a pre-authenticated admin for
 * convenience so you can simulate both unauthenticated and admin states:
 * NEXT_PUBLIC_MOCK_ADMIN_ADDRESS=0xYourAddress
 */
import { PolicyValidationError, validatePolicy } from '../validation/policy'
import {
  AccessApi,
  AccessPolicy,
  Community,
  MemberProfile,
  MemberRow,
  Membership,
  Resource,
  Role,
  Session,
  SiweAuthSession,
  WebhookEventLog,
  WalletVerification,
} from './types'
import { ApiError } from './errors'

/** Read once at module load so it is stable across renders. */
const MOCK_SESSION_STATE =
  (typeof process !== 'undefined' &&
    process.env.NEXT_PUBLIC_MOCK_SESSION_STATE) ||
  ''

const community: Community = {
  id: 'guildpass-demo',
  name: 'GuildPass Demo Community',
  description: 'Demo space for membership and gating',
  tiers: ['free', 'standard', 'pro'],
}

let resources: Resource[] = [
  { id: 'alpha', title: 'Alpha Docs', description: 'Internal docs', minTier: 'standard' },
  { id: 'pro-reports', title: 'Pro Reports', description: 'Advanced insight', minTier: 'pro' },
  { id: 'mem-updates', title: 'Member Updates', description: 'Community updates', minTier: 'free' },
]

let policies: AccessPolicy[] = [
  { resourceId: 'alpha', minTier: 'standard' },
  { resourceId: 'pro-reports', minTier: 'pro' },
  { resourceId: 'mem-updates', minTier: 'free' },
]

const mockWebhookEvents: WebhookEventLog[] = [
  {
    id: "wh_01J1",
    eventType: "membership.created",
    status: "success",
    timestamp: new Date(Date.now() - 1000 * 60 * 15).toISOString(),
    affectedIdentifier: "0x71C...3A90",
    payloadSummary: { network: "ethereum", txHash: "0xabc...123", tier: "pro" }
  },
  {
    id: "wh_01J2",
    eventType: "membership.expired",
    status: "success",
    timestamp: new Date(Date.now() - 1000 * 60 * 120).toISOString(),
    affectedIdentifier: "0x94F...8B21",
    payloadSummary: { reason: "Subscription term elapsed" }
  },
  {
    id: "wh_01J3",
    eventType: "tier.upgraded",
    status: "failed",
    timestamp: new Date(Date.now() - 1000 * 60 * 360).toISOString(),
    affectedIdentifier: "0xF39...2441",
    payloadSummary: { network: "ethereum", reason: "Gas limit hit execution revert" }
  }
]

const memberStore: Record<string, { membership: Membership; roles: Role[]; profile: MemberProfile }> = {}

function ensureAddress(addr?: string) {
  if (!addr) return null
  if (!memberStore[addr]) {
    memberStore[addr] = {
      membership: {
        address: addr,
        tier: 'free',
        active: true,
      },
      roles: ['member'],
      profile: {
        address: addr,
        displayName: `User ${addr.slice(0, 6)}`,
        badges: [],
      },
    }
  }
  return memberStore[addr]
}

/** Generate a short random hex nonce (16 bytes). */
function randomHex(): string {
  return Array.from({ length: 16 }, () =>
    Math.floor(Math.random() * 256)
      .toString(16)
      .padStart(2, '0'),
  ).join('')
}

/** Throw a mock 401 ApiError — mirrors what the live API throws on expired tokens. */
function throwMockUnauthorized(): never {
  throw new ApiError({
    status: 401,
    code: 'unauthorized',
    safeMessage: 'Session expired. Please sign in again.',
  })
}

export class MockAccessApi implements AccessApi {
  constructor(private readonly address?: string) { }

  // ── Read-only ──────────────────────────────────────────────────────────────

  async getSession(): Promise<Session> {
    const MOCK_SESSION_STATE = process.env.NEXT_PUBLIC_MOCK_SESSION_STATE || 'valid'
    if (MOCK_SESSION_STATE === 'cleared') {
      return {
        // No authenticated session
        roles: [],
        community,
      }
    }

    const data = ensureAddress(this.address)
    return {
      address: this.address,
      roles: data ? data.roles : [],
      membership: data ? data.membership : undefined,
      community,
    }
  }

  async getCommunity(): Promise<Community> {
    return community
  }

  async getMembership(address: string): Promise<Membership | null> {
    const data = ensureAddress(address)
    return data?.membership ?? null
  }

  async getProfile(address: string): Promise<MemberProfile | null> {
    const data = ensureAddress(address)
    return data?.profile ?? null
  }

  async listMembers(): Promise<MemberRow[]> {
    return Object.values(memberStore).map((m) => ({
      address: m.membership.address,
      roles: m.roles,
      tier: m.membership.tier,
      active: m.membership.active,
    }))
  }

  async listResources(): Promise<Resource[]> {
    return resources.map((r) => ({ ...r, roles: r.roles ?? [] }))
  }

  async listPolicies(): Promise<AccessPolicy[]> {
    return policies.map((p) => ({ ...p, roles: p.roles ?? [] }))
  }

  async getResource(id: string): Promise<Resource | null> {
    const r = resources.find((x) => x.id === id)
    return r ? { ...r, roles: r.roles ?? [] } : null
  }

  async getPolicy(resourceId: string): Promise<AccessPolicy | null> {
    const p = policies.find((x) => x.resourceId === resourceId)
    return p ? { ...p, roles: p.roles ?? [] } : null
  }

  // ── Admin queries & mutations ──────────────────────────────────────────────

  async listWebhookEvents(): Promise<WebhookEventLog[]> {
    return new Promise((resolve) => setTimeout(() => resolve(mockWebhookEvents), 300))
  }

  async assignRole(address: string, role: Role): Promise<void> {
    if (MOCK_SESSION_STATE === 'expired') throwMockUnauthorized()
    const data = ensureAddress(address)
    if (!data) return
    if (!data.roles.includes(role)) data.roles.push(role)
  }

  async updatePolicy(policy: AccessPolicy): Promise<void> {
    if (MOCK_SESSION_STATE === 'expired') throwMockUnauthorized()
    const result = validatePolicy(policy)

    if (!result.valid) {
      throw new PolicyValidationError(result.errors)
    }

    const idx = policies.findIndex((p) => p.resourceId === result.value.resourceId)
    if (idx >= 0) policies[idx] = result.value
    else policies.push(result.value)
  }

  // ── SIWE mock endpoints ────────────────────────────────────────────────────

  /**
   * Returns a random nonce. In a real backend this would be a single-use value
   * stored server-side to prevent replay attacks.
   */
  async getNonce(_address: string): Promise<string> {
    return randomHex()
  }

  /**
   * Mock SIWE verification — skips actual signature checking.
   *
   * - Default:          Returns a session token expiring in 1 hour.
   * - expired mode:     Returns an already-expired token (1 ms in the past) so
   *                     the provider immediately marks the session as expired.
   * - unauthenticated:  Throws a 401 ApiError to simulate backend rejection.
   */
  async siweVerify(_message: string, _signature: string): Promise<SiweAuthSession> {
    if (MOCK_SESSION_STATE === 'unauthenticated') {
      throwMockUnauthorized()
    }

    const expiresAt =
      MOCK_SESSION_STATE === 'expired'
        ? new Date(Date.now() - 1).toISOString()   // already expired
        : new Date(Date.now() + 60 * 60 * 1000).toISOString()

    return {
      isAuthenticated: true,
      token: `mock-jwt-${randomHex()}`,
      address: this.address ?? '0x0000000000000000000000000000000000000000',
      expiresAt,
    }
  }

  /** No-op logout — the sessionStorage entry is cleared by the provider. */
  async siweLogout(_token: string): Promise<void> {
    // No server-side session to invalidate in mock mode
  }

  async verifyWallet(address: string): Promise<WalletVerification> {
    return {
      verified: true,
      method: 'mock',
      checkedAt: new Date().toISOString(),
    }
  }
}
