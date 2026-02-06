export type SandboxPurpose = "website" | "code-execution" | "general"

export interface BuildSandboxMetadataInput {
  projectId: string
  purpose: SandboxPurpose
  template?: string
}

/**
 * Build SDK-compatible sandbox metadata.
 * E2B expects metadata to be Record<string, string>.
 */
export function buildSandboxMetadata(
  input: BuildSandboxMetadataInput,
  now: Date = new Date()
): Record<string, string> {
  const metadata: Record<string, string> = {
    projectId: input.projectId,
    purpose: input.purpose,
    createdAtIso: now.toISOString(),
  }

  if (input.template) {
    metadata.template = input.template
  }

  return metadata
}
