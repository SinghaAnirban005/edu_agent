import type { QuizState } from "@/types";

export function buildSummaryPrompt(
  scorePercent: number,
  weakObjectives: string[],
  quizState: QuizState
) {
  return `You are a supportive educator summarizing a student's learning session.
  
  SCORE: ${scorePercent}% first-try accuracy (${quizState.totalFirstTryCorrect}/${quizState.totalQuestions} correct on first attempt)
  EVENTUALLY CORRECT: ${quizState.totalEventuallyCorrect}/${quizState.totalQuestions} (includes retries)
  WEAK AREAS: ${weakObjectives.length > 0 ? weakObjectives.join(", ") : "None — great performance!"}
  
  Generate personalized study tips and feedback. Return ONLY valid JSON:
  {
    "studyTips": ["Tip 1", "Tip 2", "Tip 3"],
    "overallFeedback": "2-3 sentence personalized feedback message"
  }`;
}