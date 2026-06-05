import type { LearningObjective } from "@/types";

export function buildQuizPrompt(
  objective: LearningObjective,
  pdfContext: string,
  questionsPerObjective: number
) {
  return `You are an expert educator creating a multiple-choice quiz.
  
  LEARNING OBJECTIVE: ${objective.title}
  OBJECTIVE DESCRIPTION: ${objective.description}
  KEY TOPICS: ${objective.keyTopics.join(", ")}
  DIFFICULTY: ${objective.difficulty}
  
  RELEVANT CONTENT:
  """
  ${pdfContext.slice(0, 4000)}
  """
  
  Generate exactly ${questionsPerObjective} multiple-choice questions testing this objective.
  Each question must have exactly 4 options (A, B, C, D), one correct answer, a hint that doesn't give away the answer, and a clear explanation.
  
  Return ONLY valid JSON with this EXACT shape:
  {
    "questions": [
      {
        "id": "q_${objective.id}_1",
        "objectiveId": "${objective.id}",
        "objectiveTitle": "${objective.title}",
        "question": "The question text here?",
        "options": [
          {"id": "A", "text": "Option A text"},
          {"id": "B", "text": "Option B text"},
          {"id": "C", "text": "Option C text"},
          {"id": "D", "text": "Option D text"}
        ],
        "correctOptionId": "A",
        "explanation": "Detailed explanation of why A is correct and others are wrong.",
        "hint": "A subtle hint that points toward the answer without revealing it.",
        "difficulty": "${objective.difficulty}"
      }
    ]
  }`;
}