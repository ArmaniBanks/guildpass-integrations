'use client'
import { ReactNode, useMemo } from 'react'
import { useAccount } from 'wagmi'
import { useQuery } from '@tanstack/react-query'
import { getApi, type MembershipTier, type Role } from '@/lib/api'
import { computeAccessDecision } from '@/lib/api/access-decision'
import {
  accessKeys,
  queryKeys,
  ACCESS_DECISION_STALE_TIME,
  ACCESS_DECISION_GC_TIME,
} from '@/lib/query'
import Link from 'next/link'
import { buttonVariants } from './ui/button'
import { LoadingState, ErrorState, DeniedState, safeErrorMessage } from './ui/api-states'

export function Gated({
  children,
  minTier,
  roles,
  resourceId
}: {
  children: ReactNode
  minTier?: MembershipTier
  roles?: Role[]
  resourceId?: string
}) {
  const { address, chain } = useAccount()
  const env = String(chain?.id ?? 1)

  const { data: session, isLoading: sessionLoading, isError, error, refetch } = useQuery({
    queryKey: queryKeys.session.byAddress(address ?? ''),
    queryFn: () => getApi(address).getSession(),
    enabled: !!address,
    retry: 1,
  })

  const { data: policies, isLoading: policiesLoading } = useQuery({
    queryKey: queryKeys.policies.all,
    queryFn: () => getApi(address).listPolicies(),
    enabled: !!address && minTier === undefined && roles === undefined && !!resourceId,
    retry: 1,
  })

  const { data: resources, isLoading: resourcesLoading } = useQuery({
    queryKey: queryKeys.resources.all,
    queryFn: () => getApi(address).listResources(),
    enabled: !!address && minTier === undefined && roles === undefined && !!resourceId,
    retry: 1,
  })

  const dynamicPolicy = useMemo(() => {
    if (!policies || !resourceId) return undefined
    return policies.find((p) => p.resourceId === resourceId)
  }, [policies, resourceId])

  const dynamicResource = useMemo(() => {
    if (!resources || !resourceId) return undefined
    return resources.find((r) => r.id === resourceId)
  }, [resources, resourceId])

  const effectiveMinTier = minTier !== undefined
    ? minTier
    : (dynamicPolicy?.minTier !== undefined ? dynamicPolicy.minTier : dynamicResource?.minTier)

  const effectiveRoles = roles !== undefined
    ? roles
    : (dynamicPolicy?.roles !== undefined ? dynamicPolicy.roles : dynamicResource?.roles)

  const requirementsLoaded =
    minTier !== undefined ||
    roles !== undefined ||
    !resourceId ||
    (policies !== undefined && resources !== undefined)

  const { data: cachedDecision, isLoading: decisionLoading } = useQuery({
    queryKey: accessKeys.decision(env, address ?? '', resourceId ?? ''),
    queryFn: () => computeAccessDecision(session!, { minTier: effectiveMinTier, roles: effectiveRoles }),
    enabled: !!session && !!resourceId && requirementsLoaded,
    staleTime: ACCESS_DECISION_STALE_TIME,
    gcTime: ACCESS_DECISION_GC_TIME,
    retry: 1,
  })

  const fallbackDecision = useMemo(
    () => session ? computeAccessDecision(session, { minTier: effectiveMinTier, roles: effectiveRoles }) : undefined,
    [session, effectiveMinTier, effectiveRoles]
  )

  const decision = resourceId ? cachedDecision : fallbackDecision
  const isRequirementsLoading = !!resourceId && minTier === undefined && roles === undefined && (policiesLoading || resourcesLoading)
  const isLoading = resourceId ? (sessionLoading || decisionLoading || isRequirementsLoading) : sessionLoading

  if (!address) {
    return <AccessDenied reason="Please connect your wallet to continue." />
  }

  if (isLoading) {
    return <LoadingState message="Checking access…" />
  }

  if (isError) {
    return (
      <ErrorState
        title="Could not verify access"
        message={safeErrorMessage(error)}
        onRetry={() => refetch()}
      />
    )
  }

  if (!decision?.allowed) {
    return <AccessDenied reason={decision?.reason ?? 'Your current membership does not grant access.'} />
  }

  return <>{children}</>
}

export function AccessDenied({ reason }: { reason: string }) {
  return (
    <DeniedState
      title="Access denied"
      message={reason}
      actions={
        <>
        <Link href="/dashboard" className={buttonVariants()}>Back to Dashboard</Link>
        <Link href="/dashboard" className={buttonVariants({ variant: 'outline' })}>Upgrade or Renew</Link>
        </>
      }
    />
  )
}
