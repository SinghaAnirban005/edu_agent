"use client";

import React from "react";
import type { SessionResult } from "@/types";

interface SessionSummaryProps {
  result: SessionResult;
  pdfFileName: string;
  onRestart: () => void;
}

export function SessionSummary({ result, pdfFileName, onRestart }: SessionSummaryProps) {
  const scoreColor =
    result.scorePercent >= 80
      ? "text-emerald-400"
      : result.scorePercent >= 60
      ? "text-amber-400"
      : "text-rose-400";

  const scoreBg =
    result.scorePercent >= 80
      ? "from-emerald-500/20 to-emerald-500/5 border-emerald-500/30"
      : result.scorePercent >= 60
      ? "from-amber-500/20 to-amber-500/5 border-amber-500/30"
      : "from-rose-500/20 to-rose-500/5 border-rose-500/30";

  const scoreLabel =
    result.scorePercent >= 80
      ? "Excellent Work! 🎉"
      : result.scorePercent >= 60
      ? "Good Progress! 👍"
      : "Keep Practicing! 💪";

  return (
    <div className="w-full max-w-2xl mx-auto space-y-5">
      {/* Header */}
      <div className="text-center space-y-1 mb-6">
        <div className="inline-flex items-center gap-2 text-xs font-mono uppercase tracking-widest text-slate-500 mb-3">
          <div className="w-6 h-px bg-slate-600" />
          Session Complete
          <div className="w-6 h-px bg-slate-600" />
        </div>
        <h2 className="text-xl font-semibold text-white">
          {scoreLabel}
        </h2>
        <p className="text-sm text-slate-400">
          You completed the lesson from{" "}
          <span className="text-slate-300">{pdfFileName}</span>
        </p>
      </div>

      {/* Score Card */}
      <div className={`rounded-xl border bg-gradient-to-b ${scoreBg} p-6 text-center`}>
        <div className={`text-6xl font-bold font-mono ${scoreColor} mb-1`}>
          {result.scorePercent}%
        </div>
        <p className="text-slate-400 text-sm">
          {result.totalCorrect} of {result.totalQuestions} correct
        </p>
        <p className="mt-3 text-slate-300 text-sm leading-relaxed max-w-md mx-auto">
          {result.overallFeedback}
        </p>
      </div>

      <div className="rounded-xl border border-white/10 bg-white/3 overflow-hidden">
        <div className="px-4 py-3 border-b border-white/8">
          <p className="text-xs font-mono uppercase tracking-widest text-slate-500">
            Objective Breakdown
          </p>
        </div>
        <div className="p-4 space-y-3">
          {result.objectiveScores.map((obj, idx) => (
            <div key={idx} className="space-y-1.5">
              <div className="flex items-center justify-between">
                <p className="text-sm text-slate-300 font-medium truncate pr-4">
                  {obj.objectiveTitle}
                </p>
                <span
                  className={`text-sm font-mono font-bold flex-shrink-0 ${
                    obj.scorePercent >= 80
                      ? "text-emerald-400"
                      : obj.scorePercent >= 60
                      ? "text-amber-400"
                      : "text-rose-400"
                  }`}
                >
                  {obj.correct}/{obj.total}
                </span>
              </div>
              <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-700 ${
                    obj.scorePercent >= 80
                      ? "bg-emerald-500"
                      : obj.scorePercent >= 60
                      ? "bg-amber-500"
                      : "bg-rose-500"
                  }`}
                  style={{ width: `${obj.scorePercent}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-white/10 bg-white/3 overflow-hidden">
        <div className="px-4 py-3 border-b border-white/8">
          <p className="text-xs font-mono uppercase tracking-widest text-slate-500">
            Personalized Study Tips
          </p>
        </div>
        <div className="p-4 space-y-2.5">
          {result.studyTips.map((tip, idx) => (
            <div key={idx} className="flex items-start gap-3">
              <div className="flex-shrink-0 w-5 h-5 rounded-full bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center mt-0.5">
                <span className="text-indigo-300 text-[10px] font-bold">{idx + 1}</span>
              </div>
              <p className="text-sm text-slate-300 leading-relaxed">{tip}</p>
            </div>
          ))}
        </div>
      </div>

      <button
        onClick={onRestart}
        className="w-full py-3 rounded-xl bg-white/5 hover:bg-white/8 border border-white/10 hover:border-white/20 text-slate-300 hover:text-white font-medium text-sm transition-all"
      >
        Upload a New PDF
      </button>
    </div>
  );
}
