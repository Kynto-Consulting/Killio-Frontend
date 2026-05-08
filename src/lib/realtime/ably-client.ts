export type SubscriptionScope = 'user' | 'team' | 'board' | 'card' | 'room';

export function getChannelName(scope: SubscriptionScope, scopeId: string): string {
  return `${scope}:${scopeId}`;
}
