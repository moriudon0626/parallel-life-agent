// Relationship System - tracks affinity between entity pairs

export type RelationshipMap = Record<string, number>; // pairKey -> affinity (-1.0 to 1.0)

export function getPairKey(a: string, b: string): string {
  return [a, b].sort().join(':');
}

export function getAffinity(map: RelationshipMap, a: string, b: string): number {
  return map[getPairKey(a, b)] ?? 0.0;
}

export function adjustAffinity(
  map: RelationshipMap,
  a: string,
  b: string,
  delta: number
): RelationshipMap {
  const key = getPairKey(a, b);
  const current = map[key] ?? 0.0;
  const updated = Math.max(-1, Math.min(1, current + delta));
  return { ...map, [key]: updated };
}

export function affinityToDialogueContext(affinity: number, otherName: string): string {
  if (affinity > 0.6) return `${otherName}とは仲がいい`;
  if (affinity > 0.3) return `${otherName}のことは嫌いじゃない`;
  if (affinity > -0.1) return `${otherName}とは普通の関係`;
  if (affinity > -0.4) return `${otherName}はちょっと苦手`;
  return `${otherName}が嫌い`;
}

export function shouldApproach(affinity: number): boolean {
  return affinity > 0.3;
}

export function shouldAvoid(affinity: number): boolean {
  return affinity < -0.3;
}

export function affinityToDialogueProbabilityMultiplier(affinity: number): number {
  // Enemies: 0.5x, Neutral: 1.0x, Friends: 2.0x (linear interpolation)
  // affinity -1 -> 0.5, affinity 0 -> 1.0, affinity 1 -> 2.0
  return 1.0 + affinity * 0.75;
}
