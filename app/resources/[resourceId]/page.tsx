"use client"
import { useMemo } from "react"
import { useParams } from "next/navigation"
import { useAccount } from "wagmi"
import { useQuery } from "@tanstack/react-query"
import { getApi } from "@/lib/api"
import { Gated } from "@/components/gated"
import { FeatureGate } from "@/components/feature-gate"
import { EmptyState, LoadingState, ErrorState, safeErrorMessage } from "@/components/ui/api-states"
import { features } from "@/lib/features"

export default function DynamicResourceDocs() {
  const { resourceId } = useParams() as { resourceId: string }
  const { address } = useAccount()

  const { data: resource, isLoading: resourceLoading, isError, error, refetch } = useQuery({
    queryKey: ["resource", resourceId],
    queryFn: () => getApi(address).getResource(resourceId),
    enabled: !!resourceId,
    retry: 1,
  })

  const { data: policy, isLoading: policyLoading } = useQuery({
    queryKey: ["policy", resourceId],
    queryFn: () => getApi(address).getPolicy(resourceId),
    enabled: !!resourceId,
    retry: 1,
  })

  const effectiveMinTier = useMemo(() => {
    return policy?.minTier !== undefined ? policy.minTier : resource?.minTier
  }, [policy, resource])

  if (resourceLoading || policyLoading) {
    return (
      <FeatureGate enabled={features.resources} name="Resources">
        <LoadingState message="Loading resource…" />
      </FeatureGate>
    )
  }

  if (isError) {
    return (
      <FeatureGate enabled={features.resources} name="Resources">
        <ErrorState
          title="Could not load resource"
          message={safeErrorMessage(error)}
          onRetry={() => refetch()}
        />
      </FeatureGate>
    )
  }

  if (!resource) {
    return (
      <FeatureGate enabled={features.resources} name="Resources">
        <EmptyState
          title="Resource not found"
          message="The requested resource does not exist or has been removed."
        />
      </FeatureGate>
    )
  }

  return (
    <FeatureGate enabled={features.resources} name="Resources">
      <Gated minTier={effectiveMinTier} roles={policy?.roles ?? resource?.roles} resourceId={resourceId}>
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold">{resource.title}</h1>
          <p className="text-muted-foreground">
            {resource.description ? `${resource.description}. ` : ""}
            This page is gated at {effectiveMinTier ? `${effectiveMinTier.charAt(0).toUpperCase()}${effectiveMinTier.slice(1)}` : "Standard"} tier and above.
          </p>
          <EmptyState
            title="Content unavailable"
            message="Gated resource content will appear here when it is available."
          />
        </div>
      </Gated>
    </FeatureGate>
  )
}
