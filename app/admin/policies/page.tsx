'use client'

import { useState } from 'react'
import { useAccount } from 'wagmi'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getApi, type AccessPolicy } from '@/lib/api'
import { AuthError } from '@/lib/api/live'
import { FeatureGate } from '@/components/feature-gate'
import { features } from '@/lib/features'
import { applyOptimisticPolicy } from '@/lib/api/optimistic'
import { AdminGuard } from '@/components/admin-guard'
import { queryKeys } from '@/lib/query'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  DeniedState,
  EmptyState,
  ErrorState,
  LoadingState,
  safeErrorMessage,
} from '@/components/ui/api-states'
import { useSiweAuth } from '@/lib/wallet/providers'
import {
  validatePolicy,
  type PolicyValidationErrors,
} from '@/lib/validation/policy'

type PolicyRollback = {
  previousPolicies?: AccessPolicy[]
}

function SessionExpiredBanner() {
  const { signIn, isSigningIn } = useSiweAuth()

  return (
    <div id="session-expired-banner-policies">
      <DeniedState
        title="Admin session expired"
        message="Your admin session has expired."
        actions={
          <Button
            type="button"
            id="session-reauth-btn-policies"
            size="sm"
            variant="outline"
            onClick={signIn}
            disabled={isSigningIn}
            className="ml-4 shrink-0"
          >
            {isSigningIn ? 'Signing…' : 'Re-authenticate'}
          </Button>
        }
      />
    </div>
  )
}

export default function PoliciesPage() {
  const { address } = useAccount()
  const { authSession, markExpired } = useSiweAuth()
  const qc = useQueryClient()

  const [sessionExpired, setSessionExpired] = useState(false)
  const [pendingPolicyId, setPendingPolicyId] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState('')
  const [rollbackMessage, setRollbackMessage] = useState('')
  const [formErrors, setFormErrors] = useState<
    Record<string, PolicyValidationErrors>
  >({})

  const {
    data: policies,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery<AccessPolicy[]>({
    queryKey: queryKeys.policies.all,
    queryFn: () => getApi(address).listPolicies(),
    retry: 1,
  })

  const {
    mutate,
    isError: mutateError,
    error: mutateErrorValue,
    reset: resetMutation,
  } = useMutation<void, unknown, AccessPolicy, PolicyRollback>({
    mutationFn: (policy: AccessPolicy) =>
      getApi(address, authSession?.token).updatePolicy(policy),

    onMutate: async (policy) => {
      await qc.cancelQueries({ queryKey: queryKeys.policies.all })
      const previousPolicies = qc.getQueryData<AccessPolicy[]>(queryKeys.policies.all)

      setPendingPolicyId(policy.resourceId)
      setSuccessMessage('')
      setRollbackMessage('')
      setSessionExpired(false)

      qc.setQueryData<AccessPolicy[]>(queryKeys.policies.all, (currentPolicies) =>
        applyOptimisticPolicy(currentPolicies, policy),
      )

      return { previousPolicies }
    },

    onSuccess: (_data, policy) => {
      setSuccessMessage(`Policy saved for ${policy.resourceId}.`)
      setFormErrors((current) => ({
        ...current,
        [policy.resourceId]: {},
      }))
      resetMutation()
    },

    onError: (err: unknown, policy, context) => {
      qc.setQueryData(queryKeys.policies.all, context?.previousPolicies)
      setRollbackMessage(`Change reverted: ${safeErrorMessage(err)}`)

      if (err instanceof AuthError) {
        setSessionExpired(true)
        markExpired()
      }

      if (policy?.resourceId) {
        const result = validatePolicy(policy)
        if (!result.valid) {
          setFormErrors((current) => ({
            ...current,
            [policy.resourceId]: result.errors,
          }))
        }
      }
    },

    onSettled: () => {
      setPendingPolicyId(null)
      qc.invalidateQueries({ queryKey: queryKeys.policies.all })
    },
  })

  const savePolicy = (policy: AccessPolicy) => {
    const result = validatePolicy(policy)

    if (!result.valid) {
      setFormErrors((current) => ({
        ...current,
        [policy.resourceId]: result.errors,
      }))
      setSuccessMessage('')
      return
    }

    setFormErrors((current) => ({
      ...current,
      [policy.resourceId]: {},
    }))

    mutate(result.value)
  }

  return (
    <FeatureGate enabled={features.adminPolicies} name="Access Policies">
      <AdminGuard>
        <div className="space-y-4">
          <h1 className="text-2xl font-semibold">Access Policies</h1>

          {sessionExpired && <SessionExpiredBanner />}

          <Card>
            <CardHeader>
              <CardTitle>Resources</CardTitle>
            </CardHeader>

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
                <EmptyState title="No resources configured" message="No access policies have been configured yet." />
              ) : (
                policies.map((policy) => {
                  const errors = formErrors[policy.resourceId]

                  return (
                    <div key={policy.resourceId} className="space-y-1">
                      <div className="flex items-center gap-2">
                        <div className="flex w-40 items-center gap-2 text-sm">
                          <span>{policy.resourceId}</span>
                          {pendingPolicyId === policy.resourceId && (
                            <Badge variant="warning">Saving</Badge>
                          )}
                        </div>

                        <select
                          id={`policy-tier-${policy.resourceId}`}
                          className="h-9 rounded-md border px-2 text-sm"
                          value={policy.minTier ?? 'free'}
                          onChange={(e) =>
                            savePolicy({
                              ...policy,
                              minTier: e.target.value as AccessPolicy['minTier'],
                            })
                          }
                          disabled={Boolean(pendingPolicyId)}
                        >
                          <option value="free">free</option>
                          <option value="standard">standard</option>
                          <option value="pro">pro</option>
                        </select>

                        <Button
                          type="button"
                          id={`policy-save-${policy.resourceId}`}
                          variant="outline"
                          size="sm"
                          onClick={() => savePolicy({ ...policy })}
                          disabled={Boolean(pendingPolicyId)}
                        >
                          {pendingPolicyId === policy.resourceId ? 'Saving…' : 'Save'}
                        </Button>
                      </div>

                      {errors &&
                        Object.values(errors)
                          .filter(Boolean)
                          .map((message) => (
                            <div
                              key={message}
                              className="text-sm text-destructive"
                              role="alert"
                            >
                              {message}
                            </div>
                          ))}
                    </div>
                  )
                })
              )}

              {successMessage && (
                <div
                  className="text-sm text-green-700 dark:text-green-400"
                  role="status"
                >
                  {successMessage}
                </div>
              )}

              {rollbackMessage && (
                <div className="text-sm text-destructive" role="alert">
                  {rollbackMessage}
                </div>
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
    </FeatureGate>
  )
}
