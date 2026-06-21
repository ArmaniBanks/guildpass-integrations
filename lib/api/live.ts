/**
* lib/api/live.ts
*
* Live integration with guildpass-core access-api.
*/

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
BackendSession,
BackendMember,
BackendResource,
BackendPolicy,
} from './types'

function getCoreApiUrl(): string {
  const url = process.env.NEXT_PUBLIC_CORE_API_URL
  if (url) return url

  const isMockMode = process.env.NEXT_PUBLIC_MOCK_MODE === 'true'
  if (!isMockMode) {
    console.warn(
      '⚠️ NEXT_PUBLIC_CORE_API_URL is missing in live mode.\n' +
      'Falling back to http://localhost:4000.\n' +
      'To silence this warning, set NEXT_PUBLIC_CORE_API_URL in your .env.local file.'
)
}
return 'http://localhost:4000'
}

const BASE = getCoreApiUrl()

/** Thrown when the backend returns HTTP 401 (expired / invalid session token). */
export class AuthError extends Error {
constructor() {
    super('Session expired. Please sign in again.')
    this.name = 'AuthError'
  }
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    statusText: string,
    serverMessage?: string
  ) {
    super(serverMessage ? `${serverMessage} (${status})` : `Request failed (${status} ${statusText})`)
    this.name = 'ApiError'
  }
}

async function getJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  })

  if (res.status === 401) {
    throw new AuthError()
  }

  if (!res.ok) {
    let serverMessage: string | undefined
    try {
      const body = await res.json()
      const raw = body?.message ?? body?.error
      if (typeof raw === 'string' && raw.length <= 120 && !raw.includes('<')) {
        serverMessage = raw
      }
    } catch {}
    throw new ApiError(res.status, res.statusText, serverMessage)
  }

  // Handle 204 No Content (or 205 Reset Content)
  if (res.status === 204 || res.status === 205) {
    return {} as T
  }

  return res.json() as Promise<T>
}

// ── Response mappers ──────────────────────────────────────────────────────────

function mapCommunity(raw: BackendSession['community']): Community {
  if (!raw) {
    return {
      id: 'unknown',
      name: 'Unknown Community',
      description: '',
      tiers: ['free']
    };
  }

  return {
    id: raw?.id ?? '',
    name: raw?.name ?? '',
    description: raw?.description,
    tiers: raw?.tiers ?? ['free', 'standard', 'pro'],
  }
}

function requiredString(value: string | undefined, field: string): string {
  if (!value) {
    throw new ApiError(500, 'Invalid API response', `Missing ${field}`)
  }
  return value
}

function mapMembership(raw: BackendMember): Membership {
  return {
    address: raw.address ?? raw.wallet_address ?? '',
    tier: raw.tier ?? raw.membership_tier ?? 'free',
    active: raw.active ?? raw.is_active ?? false,
    expiresAt: raw.expiresAt ?? raw.expires_at,
  }
}

function mapMemberProfile(raw: any, address: string): MemberProfile {
  return {
    address,
    displayName: raw.displayName ?? raw.display_name ?? raw.username ?? 'Unknown',
    bio: raw.bio,
    badges: raw.badges ?? [],
  }
}

function mapMemberRow(raw: any): MemberRow {
  return {
    address: raw.address ?? raw.wallet_address ?? '',
    roles: raw.roles ?? [],
    tier: raw.tier ?? raw.membership_tier ?? 'free',
    active: raw.active ?? raw.is_active ?? false,
  }
}

function mapResource(raw: any): Resource {
  return {
    id: raw.id ?? '',
    title: raw.title ?? raw.name ?? 'Untitled',
    description: raw.description,
    minTier: raw.minTier ?? raw.min_tier,
    roles: raw.roles ?? [],
  }
}

function mapPolicy(raw: any): AccessPolicy {
  return {
    resourceId: raw.resourceId ?? raw.resource_id ?? '',
    minTier: raw.minTier ?? raw.min_tier ?? 'free',
    roles: raw.roles ?? [],
  }
}

function mapSession(raw: any): Session {
  return {
    address: raw.address ?? raw.wallet_address ?? '',
    roles: raw.roles ?? [],
    membership: raw.membership ? mapMembership(raw.membership as BackendMember) : undefined,
    community: raw.community ? mapCommunity(raw.community) : undefined,
  }
}

// ── LiveAccessApi ─────────────────────────────────────────────────────────────

export class LiveAccessApi implements AccessApi {
  constructor(
    private readonly address?: string,
    private readonly token?: string,
  ) {}

  private authHeaders(): HeadersInit {
    if (!this.token) return {}
    return { Authorization: `Bearer ${this.token}` }
  }

  // ── Read-only ──────────────────────────────────────────────────────────────

  async getSession(): Promise<Session> {
    const addr = this.address ? `?address=${encodeURIComponent(this.address)}` : ''
    const raw = await getJson<BackendSession>(`/v1/session${addr}`)
    return mapSession(raw)
  }

  async getCommunity(): Promise<Community> {
    const raw = await getJson<BackendSession['community']>('/v1/community')
    return mapCommunity(raw)
  }

  async getMembership(address: string): Promise<Membership | null> {
    const raw = await getJson<BackendMember | null>(
      `/v1/members/${encodeURIComponent(address)}/membership`,
)
return raw ? mapMembership(raw) : null
  }

  async getProfile(address: string): Promise<MemberProfile | null> {
    const raw = await getJson<BackendMember | null>(
      `/v1/members/${encodeURIComponent(address)}/profile`,
    )
return raw ? mapMemberProfile(raw, address) : null
  }

  async listMembers(): Promise<MemberRow[]> {
    const raw = await getJson<BackendMember[]>('/v1/members')
    return raw.map(mapMemberRow)
  }

  async listResources(): Promise<Resource[]> {
    const raw = await getJson<BackendResource[]>('/v1/resources')
    return raw.map(mapResource)
  }

  async listPolicies(): Promise<AccessPolicy[]> {
    const raw = await getJson<BackendPolicy[]>('/v1/policies')
    return raw.map(mapPolicy)
  }

  // ── Authenticated mutations ────────────────────────────────────────────────

  async assignRole(address: string, role: Role): Promise<void> {
    await getJson<void>(`/v1/members/${encodeURIComponent(address)}/roles`, {
      method: 'POST',
      headers: this.authHeaders(),
      body: JSON.stringify({ role }),
    })
  }

  async updatePolicy(policy: AccessPolicy): Promise<void> {
    await getJson<void>(`/v1/policies/${encodeURIComponent(policy.resourceId)}`, {
      method: 'PUT',
      headers: this.authHeaders(),
      body: JSON.stringify({
        resource_id: policy.resourceId,
        min_tier: policy.minTier,
        roles: policy.roles,
      }),
    })
  }

  // ── SIWE authentication ────────────────────────────────────────────────────

  async getNonce(address: string): Promise<string> {
    const data = await getJson<{ nonce: string }>('/v1/auth/siwe/nonce', {
      method: 'POST',
      body: JSON.stringify({ address }),
    })
    return data.nonce
  }

  async siweVerify(message: string, signature: string): Promise<SiweAuthSession> {
    const data = await getJson<{ token: string; address: string; expiresAt: string }>(
      '/v1/auth/siwe/verify',
      {
        method: 'POST',
        body: JSON.stringify({ message, signature }),
      },
)
return { isAuthenticated: true, ...data }
}

async siweLogout(token: string): Promise<void> {
    await getJson<void>('/v1/auth/siwe/logout', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    }).catch(() => {
      // Best-effort: don't block client-side logout if the server call fails
    })
  }
}