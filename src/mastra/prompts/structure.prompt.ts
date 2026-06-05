export function buildStructurePrompt(
  truncatedText: string
) {
  return `You are an expert educational content analyst. Analyze the following PDF text and extract structured information.
  
  PDF CONTENT:
  """
  ${truncatedText}
  """
  
  Return a JSON object with this EXACT shape (no markdown, just raw JSON):
  {
    "title": "document title or inferred topic",
    "summary": "2-3 sentence summary of the document",
    "keyPoints": ["key concept 1", "key concept 2", "key concept 3", "key concept 4", "key concept 5"]
  }`;
}