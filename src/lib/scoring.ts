/**
 * Scoring System - Real-time score calculation and tracking
 * Phase 1: Foundation for game progress measurement
 */

import type { Memory } from '../store';
import type { Building } from './building';
import type { CritterRegistryEntry } from '../store';

// ========================================
// Types
// ========================================

export interface RealtimeScore {
  current: {
    survival: number;
    development: number;
    combat: number;
    knowledge: number;
    total: number;
  };
  rank: {
    current: 'D' | 'C' | 'B' | 'A' | 'S' | 'SS';
    nextRank: 'C' | 'B' | 'A' | 'S' | 'SS' | null;
    pointsToNext: number;
    progress: number; // 0-100%
  };
  stats: {
    currentDay: number;
    population: number;
    knowledgeCount: number;
    structureCount: number;
    deathCount: number;
    combatWins: number;
    catastrophesSurvived: number;
    robotFunctional: boolean;
  };
  recentChanges: ScoreChange[];
}

export interface ScoreChange {
  type: 'gain' | 'loss';
  amount: number;
  reason: string;
  timestamp: number;
  category: 'survival' | 'development' | 'combat' | 'knowledge';
}

export interface GameRecord {
  id: string;
  playedAt: number;
  endedAt: number;
  score: RealtimeScore;
  finalPopulation: number;
  daysS urvived: number;
  causeOfEnd: 'victory' | 'robot_death' | 'extinction' | 'player_quit';
  timeline: TimelineEvent[];
  achievements: Achievement[];
}

export interface TimelineEvent {
  day: number;
  time: number; // 0-24
  type: 'birth' | 'death' | 'discovery' | 'build' | 'catastrophe' | 'milestone';
  description: string;
  importance: number; // 0-1
}

export interface Achievement {
  id: string;
  name: string;
  description: string;
  unlockedAt: number;
  rarity: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
}

// ========================================
// Score Calculation
// ========================================

export function calculateRealtimeScore(
  day: number,
  critterRegistry: CritterRegistryEntry[],
  robotMemories: Memory[],
  buildings: Building[],
  robotFunctional: boolean,
  combatStats: { wins: number; catastrophesSurvived: number }
): RealtimeScore {
  const aliveCritters = critterRegistry.filter(c => c.isAlive).length;
  const totalDeaths = critterRegistry.filter(c => !c.isAlive).length;
  const knowledgeCount = robotMemories.filter(m =>
    m.type === 'observation' || m.type === 'event'
  ).length;
  const builtStructures = buildings.filter(b => b.built).length;

  // === SURVIVAL SCORE ===
  // Base: days survived × 10
  // Bonus: population alive × 50
  // Bonus: robot functional × 500
  const survivalScore =
    day * 10 +
    aliveCritters * 50 +
    (robotFunctional ? 500 : 0);

  // === DEVELOPMENT SCORE ===
  // Knowledge discovered × 20
  // Buildings constructed × 150
  // Population generations (avg generation × 100)
  const avgGeneration = critterRegistry.length > 0
    ? critterRegistry.reduce((sum, c) => sum + c.generation, 0) / critterRegistry.length
    : 0;
  const developmentScore =
    knowledgeCount * 20 +
    builtStructures * 150 +
    Math.floor(avgGeneration * 100);

  // === COMBAT SCORE ===
  // Enemies defeated × 30
  // Catastrophes survived × 500
  const combatScore =
    combatStats.wins * 30 +
    combatStats.catastrophesSurvived * 500;

  // === KNOWLEDGE SCORE ===
  // Unique discoveries × 20
  // High-importance memories × 50
  const highImportanceMemories = robotMemories.filter(m => m.importance > 0.7).length;
  const knowledgeScore =
    knowledgeCount * 20 +
    highImportanceMemories * 50;

  // === PENALTIES ===
  const deathPenalty = totalDeaths * 50;

  // === TOTAL SCORE ===
  const totalScore = Math.max(0,
    survivalScore + developmentScore + combatScore + knowledgeScore - deathPenalty
  );

  // === RANK CALCULATION ===
  const { rank, nextRank, nextThreshold } = getRank(totalScore);
  const pointsToNext = nextRank ? nextThreshold - totalScore : 0;
  const progress = nextRank
    ? Math.min(100, (totalScore / nextThreshold) * 100)
    : 100;

  return {
    current: {
      survival: survivalScore,
      development: developmentScore,
      combat: combatScore,
      knowledge: knowledgeScore,
      total: totalScore,
    },
    rank: {
      current: rank,
      nextRank,
      pointsToNext,
      progress,
    },
    stats: {
      currentDay: day,
      population: aliveCritters,
      knowledgeCount,
      structureCount: builtStructures,
      deathCount: totalDeaths,
      combatWins: combatStats.wins,
      catastrophesSurvived: combatStats.catastrophesSurvived,
      robotFunctional,
    },
    recentChanges: [],
  };
}

function getRank(score: number): {
  rank: RealtimeScore['rank']['current'];
  nextRank: RealtimeScore['rank']['nextRank'];
  nextThreshold: number;
} {
  if (score < 1000) return { rank: 'D', nextRank: 'C', nextThreshold: 1000 };
  if (score < 3000) return { rank: 'C', nextRank: 'B', nextThreshold: 3000 };
  if (score < 6000) return { rank: 'B', nextRank: 'A', nextThreshold: 6000 };
  if (score < 10000) return { rank: 'A', nextRank: 'S', nextThreshold: 10000 };
  if (score < 15000) return { rank: 'S', nextRank: 'SS', nextThreshold: 15000 };
  return { rank: 'SS', nextRank: null, nextThreshold: 15000 };
}

// ========================================
// Score Changes Tracking
// ========================================

export function createScoreChange(
  type: 'gain' | 'loss',
  amount: number,
  reason: string,
  category: ScoreChange['category']
): ScoreChange {
  return {
    type,
    amount,
    reason,
    category,
    timestamp: Date.now(),
  };
}

export function addScoreChange(
  current: RealtimeScore,
  change: ScoreChange
): RealtimeScore {
  return {
    ...current,
    recentChanges: [...current.recentChanges, change].slice(-10), // Keep last 10
  };
}

// ========================================
// Achievements
// ========================================

export const ACHIEVEMENTS: Record<string, Omit<Achievement, 'unlockedAt'>> = {
  first_day: {
    id: 'first_day',
    name: '最初の一日',
    description: '1日目を生き延びた',
    rarity: 'common',
  },
  week_survivor: {
    id: 'week_survivor',
    name: '一週間生存',
    description: '7日間生存した',
    rarity: 'common',
  },
  month_survivor: {
    id: 'month_survivor',
    name: '一ヶ月生存',
    description: '30日間生存した',
    rarity: 'uncommon',
  },
  hundred_days: {
    id: 'hundred_days',
    name: '百日の旅路',
    description: '100日間生存した',
    rarity: 'rare',
  },
  first_shelter: {
    id: 'first_shelter',
    name: '初めての家',
    description: '最初のシェルターを建設した',
    rarity: 'common',
  },
  architect: {
    id: 'architect',
    name: '建築家',
    description: '10個の建造物を建設した',
    rarity: 'uncommon',
  },
  metropolis: {
    id: 'metropolis',
    name: '大都市',
    description: '20個の建造物を建設した',
    rarity: 'epic',
  },
  knowledge_seeker: {
    id: 'knowledge_seeker',
    name: '知識の探求者',
    description: '50個の知識を発見した',
    rarity: 'uncommon',
  },
  omniscient: {
    id: 'omniscient',
    name: '全知',
    description: '全ての知識を発見した（100個）',
    rarity: 'legendary',
  },
  population_boom: {
    id: 'population_boom',
    name: '人口爆発',
    description: '人口が15体に到達した',
    rarity: 'uncommon',
  },
  survivor: {
    id: 'survivor',
    name: '生存者',
    description: '初めての災害を乗り越えた',
    rarity: 'common',
  },
  disaster_master: {
    id: 'disaster_master',
    name: '災害の達人',
    description: '5回の大災害を乗り越えた',
    rarity: 'rare',
  },
  perfect_score: {
    id: 'perfect_score',
    name: '完璧',
    description: 'ランクSSに到達した',
    rarity: 'legendary',
  },
  no_deaths: {
    id: 'no_deaths',
    name: '不死身',
    description: '30日間、誰も死ななかった',
    rarity: 'epic',
  },
};

export function checkAchievements(
  score: RealtimeScore,
  buildings: Building[],
  currentAchievements: Achievement[]
): Achievement[] {
  const unlocked: Achievement[] = [...currentAchievements];
  const unlockedIds = new Set(unlocked.map(a => a.id));

  // Day milestones
  if (score.stats.currentDay >= 1 && !unlockedIds.has('first_day')) {
    unlocked.push({ ...ACHIEVEMENTS.first_day, unlockedAt: Date.now() });
  }
  if (score.stats.currentDay >= 7 && !unlockedIds.has('week_survivor')) {
    unlocked.push({ ...ACHIEVEMENTS.week_survivor, unlockedAt: Date.now() });
  }
  if (score.stats.currentDay >= 30 && !unlockedIds.has('month_survivor')) {
    unlocked.push({ ...ACHIEVEMENTS.month_survivor, unlockedAt: Date.now() });
  }
  if (score.stats.currentDay >= 100 && !unlockedIds.has('hundred_days')) {
    unlocked.push({ ...ACHIEVEMENTS.hundred_days, unlockedAt: Date.now() });
  }

  // Building achievements
  const builtCount = buildings.filter(b => b.built).length;
  if (builtCount >= 1 && !unlockedIds.has('first_shelter')) {
    unlocked.push({ ...ACHIEVEMENTS.first_shelter, unlockedAt: Date.now() });
  }
  if (builtCount >= 10 && !unlockedIds.has('architect')) {
    unlocked.push({ ...ACHIEVEMENTS.architect, unlockedAt: Date.now() });
  }
  if (builtCount >= 20 && !unlockedIds.has('metropolis')) {
    unlocked.push({ ...ACHIEVEMENTS.metropolis, unlockedAt: Date.now() });
  }

  // Knowledge achievements
  if (score.stats.knowledgeCount >= 50 && !unlockedIds.has('knowledge_seeker')) {
    unlocked.push({ ...ACHIEVEMENTS.knowledge_seeker, unlockedAt: Date.now() });
  }
  if (score.stats.knowledgeCount >= 100 && !unlockedIds.has('omniscient')) {
    unlocked.push({ ...ACHIEVEMENTS.omniscient, unlockedAt: Date.now() });
  }

  // Population
  if (score.stats.population >= 15 && !unlockedIds.has('population_boom')) {
    unlocked.push({ ...ACHIEVEMENTS.population_boom, unlockedAt: Date.now() });
  }

  // Disasters
  if (score.stats.catastrophesSurvived >= 1 && !unlockedIds.has('survivor')) {
    unlocked.push({ ...ACHIEVEMENTS.survivor, unlockedAt: Date.now() });
  }
  if (score.stats.catastrophesSurvived >= 5 && !unlockedIds.has('disaster_master')) {
    unlocked.push({ ...ACHIEVEMENTS.disaster_master, unlockedAt: Date.now() });
  }

  // Rank
  if (score.rank.current === 'SS' && !unlockedIds.has('perfect_score')) {
    unlocked.push({ ...ACHIEVEMENTS.perfect_score, unlockedAt: Date.now() });
  }

  // No deaths
  if (score.stats.currentDay >= 30 && score.stats.deathCount === 0 && !unlockedIds.has('no_deaths')) {
    unlocked.push({ ...ACHIEVEMENTS.no_deaths, unlockedAt: Date.now() });
  }

  return unlocked;
}

// ========================================
// Game Records
// ========================================

export function createGameRecord(
  score: RealtimeScore,
  timeline: TimelineEvent[],
  achievements: Achievement[],
  causeOfEnd: GameRecord['causeOfEnd']
): GameRecord {
  return {
    id: `game_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    playedAt: Date.now() - score.stats.currentDay * 24 * 60 * 60 * 1000, // Approximate start time
    endedAt: Date.now(),
    score,
    finalPopulation: score.stats.population,
    daysSurvived: score.stats.currentDay,
    causeOfEnd,
    timeline,
    achievements,
  };
}

export function compareGameRecords(a: GameRecord, b: GameRecord): number {
  return b.score.current.total - a.score.current.total;
}
