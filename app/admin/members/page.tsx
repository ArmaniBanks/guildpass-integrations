'use client'

import { useAccount } from 'wagmi'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getApi, type MemberRow, type Role } from '@/lib/api'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useState } from 'react'
import { AdminGuard } from '@/components/admin-guard'
import { useSiweAuth } from '@/lib/wallet/providers'
import { AuthError } from '@/lib/api/live'
import { LoadingState, ErrorState, EmptyState, safeErrorMessage } from '@/components/ui/api-states'

function SessionExpiredBanner() {
  const { signIn, isSigningIn } = useSiweAuth()
  return (
    <div
      id="session-expired-banner"
      role="alert"
      className="flex items-center justify-between rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-700/40 dark:bg-amber-900/20 dark:text-amber-300"
    >
      <span>Your admin session has expired.</span>
      <Button
        id="session-reauth-btn"
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

export default function MembersPage() {
  const { address } = useAccount()
  const { authSession } = useSiweAuth()
  const qc = useQueryClient()
  const [sessionExpired, setSessionExpired] = useState(false)

  const { data: members, isLoading, isError, error, refetch } = useQuery<MemberRow[]>({
    queryKey: ['members'],
    queryFn: () => getApi(address).listMembers(),
    retry: 1
  })

  const [addr, setAddr] = useState('')
  const [role, setRole] = useState<Role>('member')

  const {
    mutate,
    isPending,
    isError: mutateError,
    error: mutateErrorValue,
    reset: resetMutation
  } = useMutation({
    mutationFn: () => getApi(address, authSession?.token).assignRole(addr, role),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['members'] })
      setSessionExpired(false)
      setAddr('')
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
        <h1 className="text-2xl font-semibold">Members</h1>

        {sessionExpired && <SessionExpiredBanner />}

        <Card>
          <CardHeader><CardTitle>Assign Role</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-center gap-2">
              <Input
                id="assign-role-address"
                placeholder="0x…"
                value={addr}
                onChange={(e) => setAddr(e.target.value)}
              />
              <select
                id="assign-role-select"
                className="border rounded-md h-9 px-2 text-sm"
                value={role}
                onChange={(e) => setRole(e.target.value as Role)}
              >
                <option value="member">member</option>
                <option value="moderator">moderator</option>
                <option value="admin">admin</option>
              </select>
              <Button
                id="assign-role-btn"
                onClick={() => mutate()}
                disabled={!addr || isPending}
              >
                {isPending ? 'Assigning…' : 'Assign'}
              </Button>
            </div>
            {mutateError && (
              <ErrorState
                title="Failed to assign role"
                message={safeErrorMessage(mutateErrorValue)}
                onRetry={() => mutate()}
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Member List</CardTitle></CardHeader>
          <CardContent>
            {isLoading ? (
              <LoadingState message="Loading members…" />
            ) : isError ? (
              <ErrorState
                title="Failed to load members"
                message={safeErrorMessage(error)}
                onRetry={() => refetch()}
              />
            ) : !members?.length ? (
              <EmptyState message="No members yet." />
            ) : (
              <div className="space-y-2">
                {members.map((m) => (
                  <div
                    key={m.address}
                    className="flex items-center justify-between border rounded-md p-2"
                  >
                    <div className="text-sm">{m.address}</div>
                    <div className="text-xs text-muted-foreground">
                      Tier: {m.tier} • Roles: {m.roles.join(', ')}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AdminGuard>
  )
}
