"use client";

import React, { useState, useCallback, useEffect } from "react";
import { CopilotKit } from "@copilotkit/react-core";
import { CopilotPopup } from "@copilotkit/react-ui";
import "@copilotkit/react-ui/styles.css";

import { UploadZone } from "@/components/UploadZone";
import { PlanApproval } from "@/components/PlanApproval";
import { QuizWidget } from "@/components/QuizWidget";
import { SessionSummary } from "@/components/SessionSummary";
import type { LearningPlan, QuizState, SessionResult, MCQQuestion } from "@/types";

type AppPhase = "upload" | "plan_approval" | "quiz_active" | "summary";

interface ActiveQuestion {
  question: MCQQuestion;
  objectiveIndex: number;
  questionIndex: number;
  totalObjectives: number;
  totalInObjective: number;
  objectiveTitle: string;
}

function LearnApp() {
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

  useEffect(() => {
    if (!quizState) return;
    const objIdx = quizState.currentObjectiveIndex;
    const obj = quizState.objectives[objIdx];
    if (!obj) return;
    const question = obj.questions.find((q) => !obj.attempts[q.id]?.completed);
    if (!question) return;
    setActiveQuestion({
      question,
      objectiveIndex: objIdx,
      questionIndex: obj.questions.indexOf(question),
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
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) { setUploadError(data.error ?? "Upload failed."); return; }
      setSessionId(data.sessionId);
      setPdfFileName(file.name);
      setLearningPlan(data.plan);
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
      if (!res.ok) { console.error("Approval failed:", data.error); return; }
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
    async (_isCorrect: boolean, nextAction: string) => {
      if (!sessionId) return;
      if (nextAction === "quiz_complete") {
        const res = await fetch(`/api/workflow/resume?sessionId=${sessionId}`);
        const session = await res.json();
        if (session.sessionResult) {
          setSessionResult(session.sessionResult as SessionResult);
          setPhase("summary");
        }
        return;
      }
      const res = await fetch(`/api/workflow/resume?sessionId=${sessionId}`);
      const session = await res.json();
      if (session.quizState) setQuizState(session.quizState as QuizState);
    },
    [sessionId]
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

  const phaseSteps: AppPhase[] = ["plan_approval", "quiz_active", "summary"];
  const phaseLabels: Record<string, string> = {
    plan_approval: "Review Plan",
    quiz_active: "Quiz",
    summary: "Summary",
  };

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white">
      <div className="max-w-3xl mx-auto px-4 py-8">

        <div className="flex items-center justify-between mb-10">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-500 to-sky-400 flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
            </div>
            <span className="font-bold text-white tracking-tight">LearnAI</span>
            <span className="text-[10px] font-mono text-slate-600 uppercase tracking-widest ml-1">Powered by Groq</span>
          </div>

          {phase !== "upload" && (
            <div className="flex items-center gap-2 text-xs text-slate-500 font-mono">
              {phaseSteps.map((p, i) => {
                const currentIdx = phaseSteps.indexOf(phase);
                const isDone = currentIdx > i;
                const isActive = phase === p;
                return (
                  <React.Fragment key={p}>
                    {i > 0 && <span className="text-slate-700">›</span>}
                    <span className={isActive ? "text-indigo-400" : isDone ? "text-slate-600 line-through" : "text-slate-700"}>
                      {phaseLabels[p]}
                    </span>
                  </React.Fragment>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex items-start justify-center">
          <div className="w-full">
            {phase === "upload" && (
              <>
                {uploadError && (
                  <div className="mb-4 p-3 rounded-lg bg-rose-500/10 border border-rose-500/25 text-rose-300 text-sm text-center">
                    {uploadError}
                  </div>
                )}
                <UploadZone onUpload={handleUpload} loading={uploadLoading} />
              </>
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

      </div>

      <CopilotPopup
        instructions="You are a helpful learning assistant. You have access to the user's current learning plan. You can answer questions about it, and you can approve or reject it on their behalf when they ask you to."
        defaultOpen={false}
        labels={{
          title: "LearnAI Assistant",
          initial: "Hi! I can see your learning plan. Ask me anything about it, or tell me to approve or cancel it.",
        }}
      />
    </div>
  );
}

export default function LearnPage() {
  return (
    <CopilotKit runtimeUrl="/api/copilotkit">
      <LearnApp />
    </CopilotKit>
  );
}