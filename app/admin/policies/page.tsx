'use client'

import { useAccount } from 'wagmi'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getApi, type AccessPolicy } from '@/lib/api'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { AdminGuard } from '@/components/admin-guard'
import { useSiweAuth } from '@/lib/wallet/providers'
import { AuthError } from '@/lib/api/live'
import { useState } from 'react'
import { LoadingState, ErrorState, EmptyState, safeErrorMessage } from '@/components/ui/api-states'

function SessionExpiredBanner() {
  const { signIn, isSigningIn } = useSiweAuth()
  return (
    <div
      id="session-expired-banner-policies"
      role="alert"
      className="flex items-center justify-between rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-700/40 dark:bg-amber-900/20 dark:text-amber-300"
    >
      <span>Your admin session has expired.</span>
      <Button
        id="session-reauth-btn-policies"
        size="sm"
        variant="outline"
        onClick={signIn}
        disabled={isSigningIn}
        className="ml-4 shrink-0"
      >
        {isSigningIn ? 'Signing…' : 'Re-authenticate'}
      </Button>
    </div>
  )
}

export default function PoliciesPage() {
  const { address } = useAccount()
  const { authSession } = useSiweAuth()
  const qc = useQueryClient()
  const [sessionExpired, setSessionExpired] = useState(false)

  const { data: policies, isLoading, isError, error, refetch } = useQuery<AccessPolicy[]>({
    queryKey: ['policies'],
    queryFn: () => getApi(address).listPolicies(),
    retry: 1
  })

  const {
    mutate,
    isPending,
    isError: mutateError,
    error: mutateErrorValue,
    reset: resetMutation
  } = useMutation({
    mutationFn: (p: AccessPolicy) =>
      getApi(address, authSession?.token).updatePolicy(p),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['policies'] })
      setSessionExpired(false)
      resetMutation()
    },
    onError: (err: unknown) => {
      if (err instanceof AuthError) {
        setSessionExpired(true)
      }
    },
  })

  return (
    <AdminGuard>
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold">Access Policies</h1>

        {sessionExpired && <SessionExpiredBanner />}

        <Card>
          <CardHeader><CardTitle>Resources</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {isLoading ? (
              <LoadingState message="Loading policies…" />
            ) : isError ? (
              <ErrorState
                title="Failed to load policies"
                message={safeErrorMessage(error)}
                onRetry={() => refetch()}
              />
            ) : !policies?.length ? (
              <EmptyState message="No resources configured." />
            ) : (
              policies.map((p) => (
                <div key={p.resourceId} className="flex items-center gap-2">
                  <div className="w-40 text-sm">{p.resourceId}</div>
                  <select
                    id={`policy-tier-${p.resourceId}`}
                    className="border rounded-md h-9 px-2 text-sm"
                    value={p.minTier ?? 'free'}
                    onChange={(e) => mutate({ ...p, minTier: e.target.value as AccessPolicy['minTier'] })}
                    disabled={isPending}
                  >
                    <option value="free">free</option>
                    <option value="standard">standard</option>
                    <option value="pro">pro</option>
                  </select>
                  <Button
                    id={`policy-save-${p.resourceId}`}
                    variant="outline"
                    size="sm"
                    onClick={() => mutate({ ...p })}
                    disabled={isPending}
                  >
                    {isPending ? 'Saving…' : 'Save'}
                  </Button>
                </div>
              ))
            )}
            {mutateError && (
              <ErrorState
                title="Failed to save policy"
                message={safeErrorMessage(mutateErrorValue)}
              />
            )}
          </CardContent>
        </Card>
      </div>
    </AdminGuard>
  )
}
