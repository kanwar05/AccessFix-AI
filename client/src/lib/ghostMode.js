export function getGhostStatus(issueId, { proposal, verification } = {}) {
  if (verification?.introducedRuleIds?.includes(issueId)) {
    return { label: 'New Apparition', className: 'introduced', description: 'This rule was introduced by the verified after-scan and remains visible for review.' };
  }
  if (verification?.resolvedRuleIds?.includes(issueId)) {
    return { label: 'Ghost Removed', className: 'resolved', description: 'The before/after comparison verified that this rule is no longer present.' };
  }
  if (verification?.remainingRuleIds?.includes(issueId)) {
    return { label: 'Still Haunting', className: 'remaining', description: 'The after-scan still reports this rule; no successful resolution is claimed.' };
  }
  if (proposal && !proposal.applied) {
    return { label: 'Awaiting Permission', className: 'proposed', description: 'An AI-generated exorcism is available, but it has not been approved or verified.' };
  }
  return { label: 'Ghost Detected', className: 'detected', description: 'A real axe finding identified this accessibility barrier.' };
}
