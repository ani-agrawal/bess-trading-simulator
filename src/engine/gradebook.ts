import type { GameState } from './types';
import { assessLesson } from './lessonAssessment';
import { scoreMission } from './missionScoring';
import type { LessonId } from '../components/TrainingLesson';

export interface GradebookLesson {
  lessonId: LessonId;
  title: string;
  score: number;
  grade: string;
  readiness: string;
  passed: number;
  total: number;
}

export interface Gradebook {
  averageScore: number;
  completedLessons: number;
  lessons: GradebookLesson[];
}

const TITLES: Record<LessonId, string> = {
  1: 'Arbitrage',
  2: 'Day-Ahead',
  3: 'Intraday',
  4: 'Imbalance',
  5: 'Market Context',
};

export function getGradebook(state: GameState): Gradebook {
  const lessons = ([1, 2, 3, 4, 5] as LessonId[]).map(lessonId => {
    const assessment = assessLesson(state, lessonId);
    const score = scoreMission(state, lessonId);
    return {
      lessonId,
      title: TITLES[lessonId],
      score: score.score,
      grade: score.grade,
      readiness: assessment.readiness,
      passed: assessment.passed,
      total: assessment.total,
    };
  });

  const averageScore = Math.round(lessons.reduce((sum, lesson) => sum + lesson.score, 0) / lessons.length);
  const completedLessons = lessons.filter(lesson => lesson.readiness === 'ready').length;

  return { averageScore, completedLessons, lessons };
}
