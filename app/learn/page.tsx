"use client";

import React, { useState, useCallback, useEffect } from "react";
import {
  CopilotKit,
  useCopilotChat,
  useCopilotAction,
  useCopilotReadable
} from "@copilotkit/react-core";
import { CopilotChat } from "@copilotkit/react-ui";
import "@copilotkit/react-ui/styles.css";

import { UploadZone } from "@/components/UploadZone";
import { PlanApproval } from "@/components/PlanApproval";
import { QuizWidget } from "@/components/QuizWidget";
import { SessionSummary } from "@/components/SessionSummary";
import type {
  LearningPlan,
  QuizState,
  SessionResult,
  MCQQuestion,
  ObjectiveQuizState,
} from "@/types";

type AppPhase =
  | "upload"
  | "plan_approval"
  | "quiz_initializing"
  | "quiz_active"
  | "summary";

interface ActiveQuestion {
  question: MCQQuestion;
  objectiveIndex: number;
  questionIndex: number;
  totalObjectives: number;
  totalInObjective: number;
  objectiveTitle: string;
}

function LearningApp() {
  const [phase, setPhase] = useState<AppPhase>("upload");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [pdfFileName, setPdfFileName] = useState<string>("");
  const [uploadLoading, setUploadLoading] = useState(false);
  const [approvalLoading, setApprovalLoading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [learningPlan, setLearningPlan] = useState<LearningPlan | null>(null);
  const [quizState, setQuizState] = useState<QuizState | null>(null);
  const [activeQuestion, setActiveQuestion] = useState<ActiveQuestion | null>(null);
  const [sessionResult, setSessionResult] = useState<SessionResult | null>(null);

  const [lessonContent, setLessonContent] = useState("");
  const [structuredContent, setStructuredContent] = useState<any>(null);

  console.log(learningPlan)
  console.log(activeQuestion)

  console.log(phase)

  useEffect(() => {
    if (!quizState) return;
    const objIdx = quizState.currentObjectiveIndex;
    const obj = quizState.objectives[objIdx];
    if (!obj) return;

    const question = obj.questions.find(
      (q) => !obj.attempts[q.id]?.completed
    );
    if (!question) return;

    const qIdx = obj.questions.indexOf(question);
    setActiveQuestion({
      question,
      objectiveIndex: objIdx,
      questionIndex: qIdx,
      totalObjectives: quizState.objectives.length,
      totalInObjective: obj.questions.length,
      objectiveTitle: obj.objectiveTitle,
    });
  }, [quizState]);

  const handleUpload = useCallback(async (file: File) => {
    setUploadError(null);
    setUploadLoading(true);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        setUploadError(data.error ?? "Upload failed. Please try again.");
        return;
      }

      setSessionId(data.sessionId);
      setPdfFileName(file.name);
      setLearningPlan(data.plan);
      setLessonContent(data.lessonContent ?? "");
      setStructuredContent(data.structuredContent ?? null);
      setPhase("plan_approval");
    } catch {
      setUploadError("Network error. Please check your connection and try again.");
    } finally {
      setUploadLoading(false);
    }
  }, []);

  const handleApprove = useCallback(async () => {
    if (!sessionId) return;
    setApprovalLoading(true);

    try {
      const res = await fetch("/api/workflow/resume", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, action: "approve" }),
      });

      const data = await res.json();

      if (!res.ok) {
        console.error("Approval failed:", data.error);
        return;
      }

      setQuizState(data.quizState);
      setPhase("quiz_active");
    } catch (err) {
      console.error("Approval error:", err);
    } finally {
      setApprovalLoading(false);
    }
  }, [sessionId]);

  const handleReject = useCallback(async () => {
    if (sessionId) {
      await fetch("/api/workflow/resume", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, action: "reject" }),
      }).catch(() => {});
    }
    setPhase("upload");
    setSessionId(null);
    setLearningPlan(null);
  }, [sessionId]);

  const handleQuizComplete = useCallback(
    async (isCorrect: boolean, nextAction: string, explanation: string) => {
      if (!sessionId || !quizState) return;

      if (nextAction === "quiz_complete") {
        const res = await fetch(
          `/api/workflow/resume?sessionId=${sessionId}`
        );
        const session = await res.json();
        if (session.sessionResult) {
          setSessionResult(session.sessionResult as SessionResult);
          setPhase("summary");
        }
        return;
      }

      if (nextAction === "next_objective" || nextAction === "next_question") {
        const res = await fetch(
          `/api/workflow/resume?sessionId=${sessionId}`
        );
        const session = await res.json();
        if (session.quizState) {
          setQuizState(session.quizState as QuizState);
        }
      }
    },
    [sessionId, quizState]
  );

  const handleRestart = useCallback(() => {
    setPhase("upload");
    setSessionId(null);
    setPdfFileName("");
    setLearningPlan(null);
    setQuizState(null);
    setActiveQuestion(null);
    setSessionResult(null);
    setUploadError(null);
  }, []);

  console.log(lessonContent)

  useCopilotReadable({
    description: "The uploaded PDF content",
    value: lessonContent,
  });

  useCopilotReadable({
    description: "Document summary and extracted key points",
    value: structuredContent,
  });

  useCopilotReadable({
    description: "Generated learning plan",
    value: learningPlan,
  });

  useCopilotReadable({
    description: "Current quiz state",
    value: quizState,
  });

  useCopilotReadable({
    description: "Current active question",
    value: activeQuestion,
  });

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white">
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-10">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-500 to-sky-400 flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
            </div>
            <span className="font-bold text-white tracking-tight">LearnAI</span>
            <span className="text-[10px] font-mono text-slate-600 uppercase tracking-widest ml-1">
              Powered by Groq
            </span>
          </div>

          {phase !== "upload" && (
            <div className="flex items-center gap-2 text-xs text-slate-500 font-mono">
              {["plan_approval", "quiz_initializing", "quiz_active", "summary"].map(
                (p, i) => (
                  <React.Fragment key={p}>
                    {i > 0 && <span>›</span>}
                    <span
                      className={
                        phase === p
                          ? "text-indigo-400"
                          : ["plan_approval", "quiz_initializing", "quiz_active", "summary"].indexOf(phase) > i
                          ? "text-slate-500 line-through"
                          : "text-slate-700"
                      }
                    >
                      {p === "plan_approval"
                        ? "Review"
                        : p === "quiz_initializing"
                        ? "Init"
                        : p === "quiz_active"
                        ? "Quiz"
                        : "Summary"}
                    </span>
                  </React.Fragment>
                )
              )}
            </div>
          )}
        </div>

        <div className="flex gap-6">
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-center min-h-[60vh]">
              {phase === "upload" && (
                <div className="w-full">
                  {uploadError && (
                    <div className="mb-4 max-w-2xl mx-auto p-3 rounded-lg bg-rose-500/10 border border-rose-500/25 text-rose-300 text-sm text-center">
                      {uploadError}
                    </div>
                  )}
                  <UploadZone onUpload={handleUpload} loading={uploadLoading} />
                </div>
              )}

              {phase === "plan_approval" && learningPlan && (
                <PlanApproval
                  plan={learningPlan}
                  pdfFileName={pdfFileName}
                  onApprove={handleApprove}
                  onReject={handleReject}
                  loading={approvalLoading}
                />
              )}

              {phase === "quiz_active" && activeQuestion && sessionId && (
                <QuizWidget
                  key={activeQuestion.question.id}
                  sessionId={sessionId}
                  question={activeQuestion.question}
                  objectiveTitle={activeQuestion.objectiveTitle}
                  objectiveIndex={activeQuestion.objectiveIndex}
                  totalObjectives={activeQuestion.totalObjectives}
                  questionIndex={activeQuestion.questionIndex}
                  totalQuestionsInObjective={activeQuestion.totalInObjective}
                  onComplete={handleQuizComplete}
                />
              )}

              {phase === "summary" && sessionResult && (
                <SessionSummary
                  result={sessionResult}
                  pdfFileName={pdfFileName}
                  onRestart={handleRestart}
                />
              )}
            </div>
          </div>

          {/* Right: CopilotKit Chat Panel */}
          {/* {phase !== "upload" && (
            <div className="w-80 flex-shrink-0">
              <div className="sticky top-8 rounded-xl border border-white/10 bg-white/2 overflow-hidden h-[75vh] flex flex-col">
                <div className="px-4 py-3 border-b border-white/8 flex-shrink-0">
                  <p className="text-xs font-mono uppercase tracking-widest text-slate-500">
                    AI Tutor
                  </p>
                  <p className="text-sm text-white font-medium mt-0.5">
                    Ask questions about the topic
                  </p>
                </div>
                <div className="flex-1 overflow-hidden">
                  <CopilotChat
                    instructions={`
                      You are an AI tutor helping a student learn from an uploaded PDF.

                      You have access to:
                      - The PDF content
                      - The generated learning plan
                      - Extracted document summary
                      - Learning objectives
                      - Current quiz state

                      Always answer using the provided lesson content.

                      Never claim:
                      - You don't know the lesson
                      - You lack access to the lesson
                      - You have a knowledge cutoff

                      The lesson content has already been provided through application state.

                      If the student asks:
                      - What is this lesson about?
                      - What are the objectives?
                      - Summarize this topic.

                      Answer directly using the uploaded document.

                      For quiz questions:
                      - Never reveal the correct answer.
                      - Use Socratic guidance.
                      - Give hints only.
                      `}
                    labels={{
                      title: "AI Tutor",
                      initial: "Hi! I'm your AI tutor. Ask me anything about the material — I'll help you understand without giving away quiz answers! 🎓",
                    }}
                    className="h-full"
                  />
                </div>
              </div>
            </div>
          )} */}
        </div>
      </div>
    </div>
  );
}

export default function LearnPage() {
  return (
    <CopilotKit runtimeUrl="/api/copilotkit">
      <LearningApp />
    </CopilotKit>
  );
}
