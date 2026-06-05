export function buildPlanPrompt(
  structuredContent: { title: string; summary: string; keyPoints: string[] },
  truncatedText: string
) {
  return `You are an expert curriculum designer. Based on this document content, create a structured learning plan.
  
  DOCUMENT TITLE: ${structuredContent.title}
  DOCUMENT SUMMARY: ${structuredContent.summary}
  KEY POINTS: ${structuredContent.keyPoints.join(", ")}
  
  TRUNCATED PDF TEXT:
  """
  ${truncatedText.slice(0, 6000)}
  """
  
  Create a learning plan with 3-5 clear learning objectives. Each objective should be testable with multiple-choice questions.
  
  Return ONLY a valid JSON object with this EXACT shape:
  {
    "objectives": [
      {
        "id": "obj_1",
        "title": "Short objective title",
        "description": "Clear description of what student will learn",
        "difficulty": "beginner|intermediate|advanced",
        "keyTopics": ["topic1", "topic2", "topic3"]
      }
    ],
    "estimatedMinutes": 25,
    "overallDifficulty": "beginner|intermediate|advanced",
    "summary": "Brief overview of what this lesson covers"
  }`;
}