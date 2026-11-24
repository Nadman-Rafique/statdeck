/**
 * src/utils/scoring.js
 * Core logic for chapter, subject, and /500 unified ranking.
 */

// 1. Calculate the chapter exam points (max 40)
export function calculateChapterExamPoints(recentAttempts) {
  // recentAttempts is an array of the last 3 chronological scores (0-100)
  if (!recentAttempts || recentAttempts.length === 0) return 0;
  
  const bestScore = Math.max(...recentAttempts);

  if (bestScore < 40) return 0;
  // 40% to 80%: Interpolate from 0 to 30 points
  if (bestScore <= 80) return 30 * ((bestScore - 40) / 40); 
  // 80% to 100%: Interpolate from 30 to 40 points
  return 30 + 10 * ((bestScore - 80) / 20); 
}

// 2. Calculate the total chapter score (max 100)
export function calculateChapterScore(progress, recentAttempts) {
  let score = 0;
  
  if (progress.basicConcept) score += 20;
  if (progress.basicQn) score += 20;
  if (progress.masterNote) score += 20;

  score += calculateChapterExamPoints(recentAttempts);
  
  // Cap at 100 as a safety measure
  return Math.min(score, 100); 
}

// 3. Calculate final subject score (max 100%)
export function calculateSubjectScore(chapters, mockScorePct = 0) {
  // chapters format: [{ weight: 8, score: 85 }, { weight: 5, score: 70 }]
  if (!chapters || chapters.length === 0) return 0;

  let totalWeight = 0;
  let weightedScoreSum = 0;

  chapters.forEach(ch => {
    totalWeight += ch.weight;
    weightedScoreSum += (ch.weight * ch.score);
  });

  const weightedChapterAvg = totalWeight === 0 ? 0 : (weightedScoreSum / totalWeight);
  
  // 80% from chapters, 20% from subject mock
  return (0.80 * weightedChapterAvg) + (0.20 * mockScorePct);
}

// 4. Calculate Unified /500 Rank and Tier
export function calculateUnifiedRank(subjectScores, tutorBonus = 0) {
  // subjectScores = array of final subject percentages (0-100)
  const base = 50;
  
  // Ensure tutor bonus stays exactly within 0-50
  const safeTutorBonus = Math.min(Math.max(tutorBonus, 0), 50); 

  let avgSubjectPct = 0;
  if (subjectScores.length > 0) {
    const totalPct = subjectScores.reduce((sum, score) => sum + score, 0);
    avgSubjectPct = totalPct / subjectScores.length;
  }

  const academicPoints = avgSubjectPct * 4;
  const totalScore = Math.round(base + academicPoints + safeTutorBonus);

  // Map to Rank Tiers
  let rankTier = "Starter";
  if (totalScore >= 450) rankTier = "Apex";
  else if (totalScore >= 350) rankTier = "Scholar";
  else if (totalScore >= 250) rankTier = "Striver";
  else if (totalScore >= 150) rankTier = "Challenger";

  return { totalScore, rankTier };
}