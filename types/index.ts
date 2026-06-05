export interface LearningObjective {
  id: string;
  title: string;
  description: string;
  difficulty: "beginner" | "intermediate" | "advanced";
  keyTopics: string[];
}

export interface LearningPlan {
  objectives: LearningObjective[];
  estimatedMinutes: number;
  overallDifficulty: "beginner" | "intermediate" | "advanced";
  summary: string;
}

export interface MCQOption {
  id: string;
  text: string;
}

export interface MCQQuestion {
  id: string;
  objectiveId: string;
  objectiveTitle: string;
  question: string;
  options: MCQOption[];
  correctOptionId: string;
  explanation: string;
  hint: string;
  difficulty: "beginner" | "intermediate" | "advanced";
}

export interface QuizAttempt {
  questionId: string;
  selectedOptionId: string | null;
  isCorrect: boolean | null;
  attempts: number;
  hintsUsed: number;
  completed: boolean;
}

export interface ObjectiveQuizState {
  objectiveId: string;
  objectiveTitle: string;
  questions: MCQQuestion[];
  attempts: Record<string, QuizAttempt>;
  completed: boolean;
  score: number;
}

export interface QuizState {
  currentObjectiveIndex: number;
  objectives: ObjectiveQuizState[];
  totalCorrect: number;
  totalQuestions: number;
  startedAt: string;
}

export interface SessionResult {
  totalCorrect: number;
  totalQuestions: number;
  scorePercent: number;
  objectiveScores: Array<{
    objectiveTitle: string;
    correct: number;
    total: number;
    scorePercent: number;
  }>;
  studyTips: string[];
  overallFeedback: string;
  completedAt: string;
}

export interface SessionState {
  id: string;
  pdfFileName: string;
  workflowStatus: string;
  learningPlan: LearningPlan | null;
  planApproved: boolean;
  quizState: QuizState | null;
  sessionResult: SessionResult | null;
}

export interface RenderQuizPayload {
  sessionId: string;
  question: MCQQuestion;
  objectiveTitle: string;
  objectiveIndex: number;
  totalObjectives: number;
  questionIndex: number;
  totalQuestionsInObjective: number;
}

export interface RenderPlanPayload {
  sessionId: string;
  plan: LearningPlan;
  pdfFileName: string;
}

export interface RenderSummaryPayload {
  sessionId: string;
  result: SessionResult;
}
