"use client";

import React, { useState, useCallback } from "react";
import type { MCQQuestion, MCQOption } from "@/types";

interface QuizWidgetProps {
  sessionId: string;
  question: MCQQuestion;
  objectiveTitle: string;
  objectiveIndex: number;
  totalObjectives: number;
  questionIndex: number;
  totalQuestionsInObjective: number;
  onComplete: (isCorrect: boolean, nextAction: string) => void;
}

type AnswerState = "idle" | "correct" | "incorrect" | "loading";

export function QuizWidget({
  sessionId,
  question,
  objectiveTitle,
  objectiveIndex,
  totalObjectives,
  questionIndex,
  totalQuestionsInObjective,
  onComplete,
}: QuizWidgetProps) {
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [answerState, setAnswerState] = useState<AnswerState>("idle");
  const [explanation, setExplanation] = useState<string>("");
  const [hint, setHint] = useState<string>("");
  const [showHint, setShowHint] = useState(false);
  const [attempts, setAttempts] = useState(0);

  const handleSubmit = useCallback(async () => {
    if (!selectedOption || answerState === "loading") return;
    setAnswerState("loading");

    try {
      const res = await fetch("/api/quiz/answer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          questionId: question.id,
          selectedOptionId: selectedOption,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      const newAttempts = attempts + 1;
      setAttempts(newAttempts);

      if (data.isCorrect) {
        setAnswerState("correct");
        setExplanation(data.explanation);
        setTimeout(() => onComplete(true, data.nextAction), 2200);
      } else {
        setAnswerState("incorrect");
        setHint(data.hint);
        setShowHint(true);

        setTimeout(() => {
          setAnswerState("idle");
          setSelectedOption(null);
        }, 1600);
      }
    } catch (err) {
      console.error("Submit error:", err);
      setAnswerState("idle");
    }
  }, [selectedOption, answerState, sessionId, question.id, attempts, onComplete]);

  const difficultyColor = {
    beginner: "text-emerald-400 bg-emerald-400/10 border-emerald-400/30",
    intermediate: "text-amber-400 bg-amber-400/10 border-amber-400/30",
    advanced: "text-rose-400 bg-rose-400/10 border-rose-400/30",
  }[question.difficulty];

  const getOptionStyle = (optionId: string) => {
    const isSelected = selectedOption === optionId;
    if (answerState === "correct" && isSelected) {
      return "border-emerald-500 bg-emerald-500/15 text-emerald-100 shadow-[0_0_20px_rgba(16,185,129,0.2)]";
    }
    if (answerState === "incorrect" && isSelected) {
      return "border-rose-500 bg-rose-500/15 text-rose-100 shadow-[0_0_20px_rgba(239,68,68,0.2)]";
    }
    if (answerState === "loading" && isSelected) {
      return "border-sky-400 bg-sky-400/10 text-sky-100 animate-pulse";
    }
    if (isSelected) {
      return "border-sky-400 bg-sky-400/10 text-sky-100";
    }
    return "border-white/10 bg-white/[0.03] text-slate-300 hover:border-white/25 hover:bg-white/[0.06] hover:text-white";
  };

  const objectiveProgress = (objectiveIndex / totalObjectives) * 100;

  return (
    <div className="quiz-widget w-full max-w-2xl mx-auto">
      <div className="mb-5 space-y-2">
        <div className="flex items-center justify-between text-xs text-slate-400">
          <span className="font-mono uppercase tracking-widest">
            Objective {objectiveIndex + 1}/{totalObjectives}
          </span>
          <span className="font-mono">
            Q{questionIndex + 1}/{totalQuestionsInObjective}
          </span>
        </div>
        <div className="h-1 bg-white/5 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-indigo-500 to-sky-400 rounded-full transition-all duration-700"
            style={{ width: `${objectiveProgress}%` }}
          />
        </div>
        <p className="text-sm font-medium text-slate-300 truncate">{objectiveTitle}</p>
      </div>

      <div className="rounded-xl border border-white/10 bg-white/[0.03] backdrop-blur-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-white/[0.08]">
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 w-7 h-7 rounded-lg bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center mt-0.5">
              <span className="text-indigo-300 text-xs font-bold font-mono">{questionIndex + 1}</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white font-medium leading-relaxed text-[15px]">{question.question}</p>
            </div>
            <span className={`flex-shrink-0 text-[10px] font-mono uppercase tracking-widest px-2 py-1 rounded-md border ${difficultyColor}`}>
              {question.difficulty}
            </span>
          </div>
        </div>

        <div className="p-4 space-y-2.5">
          {question.options.map((option: MCQOption) => (
            <button
              key={option.id}
              onClick={() => { if (answerState === "idle") setSelectedOption(option.id); }}
              disabled={answerState !== "idle"}
              className={`w-full text-left px-4 py-3 rounded-lg border transition-all duration-200 flex items-center gap-3 cursor-pointer disabled:cursor-default ${getOptionStyle(option.id)}`}
            >
              <div className={`flex-shrink-0 w-4 h-4 rounded-full border-2 flex items-center justify-center transition-all ${
                selectedOption === option.id
                  ? answerState === "correct" ? "border-emerald-400 bg-emerald-400"
                  : answerState === "incorrect" ? "border-rose-400 bg-rose-400"
                  : "border-sky-400 bg-sky-400"
                  : "border-white/20"
              }`}>
                {selectedOption === option.id && (
                  <div className="w-1.5 h-1.5 rounded-full bg-white" />
                )}
              </div>
              <span className="text-sm font-mono font-semibold opacity-60 mr-1 flex-shrink-0">{option.id}</span>
              <span className="text-sm leading-relaxed">{option.text}</span>
            </button>
          ))}
        </div>

        {answerState === "correct" && (
          <div className="mx-4 mb-4 p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/30">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center flex-shrink-0">
                <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <span className="text-emerald-300 font-semibold text-sm">
                Correct{attempts === 1 ? " — first try!" : "!"}
              </span>
            </div>
            <p className="text-emerald-100/80 text-sm leading-relaxed">{explanation}</p>
          </div>
        )}

        {showHint && answerState !== "correct" && (
          <div className="mx-4 mb-3 p-4 rounded-lg bg-rose-500/10 border border-rose-500/30">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-5 h-5 rounded-full bg-rose-500 flex items-center justify-center flex-shrink-0">
                <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
              <span className="text-rose-300 font-semibold text-sm">Not quite — try again</span>
            </div>
            <div className="flex items-start gap-2 mt-2">
              <span className="text-amber-400 flex-shrink-0">💡</span>
              <p className="text-amber-100/80 text-sm leading-relaxed">{hint}</p>
            </div>
          </div>
        )}

        {attempts > 0 && answerState !== "correct" && (
          <div className="mx-4 mb-3">
            <p className="text-xs text-slate-600 font-mono text-center">
              Attempt {attempts + 1} &mdash; no penalty for retries, but first-try accuracy affects your score
            </p>
          </div>
        )}

        <div className="px-4 pb-4">
          <button
            onClick={handleSubmit}
            disabled={!selectedOption || answerState === "loading" || answerState === "correct"}
            className="w-full py-2.5 px-5 rounded-lg font-semibold text-sm transition-all duration-200
              bg-indigo-600 hover:bg-indigo-500 text-white
              disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-indigo-600
              active:scale-[0.98]"
          >
            {answerState === "loading"
              ? "Checking..."
              : answerState === "correct"
              ? "✓ Correct — moving on..."
              : attempts > 0
              ? "Try Again"
              : "Submit Answer"}
          </button>
        </div>
      </div>
    </div>
  );
}
