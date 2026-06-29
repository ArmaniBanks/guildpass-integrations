import { NextRequest, NextResponse } from 'next/server'
import {
  fetchMembershipByWallet,
  GatewayConfigurationError,
  GatewayDependencyError,
  GatewayMethodError,
} from '@/lib/integration-client'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const address = req.nextUrl.searchParams.get('address')

  if (!address) {
    return NextResponse.json(
      { error: 'Missing required query parameter: address' },
      { status: 400 },
    )
  }

  try {
    const membership = await fetchMembershipByWallet(address)
    return NextResponse.json(membership)
  } catch (error) {
    console.error('[Integration Gateway Error]:', error)

    if (error instanceof GatewayConfigurationError) {
      return NextResponse.json(
        { error: 'Integration gateway misconfigured.' },
        { status: 503 },
      )
    }
    if (error instanceof GatewayDependencyError) {
      return NextResponse.json(
        { error: 'Integration gateway unavailable: missing optional dependency.' },
        { status: 503 },
      )
    }
    if (error instanceof GatewayMethodError) {
      return NextResponse.json(
        { error: 'Integration gateway unavailable: unsupported client method.' },
        { status: 503 },
      )
    }

    return NextResponse.json(
      { error: 'Unable to fetch membership information due to an internal error.' },
      { status: 502 },
    )
  }
}
