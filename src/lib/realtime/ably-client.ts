export type SubscriptionScope = 'user' | 'team' | 'board' | 'card';

export function getChannelName(scope: SubscriptionScope, scopeId: string): string {
  return `${scope}:${scopeId}`;
}
