"use client";

import React from "react";
import type { LearningPlan } from "@/types";

interface PlanApprovalProps {
  plan: LearningPlan;
  pdfFileName: string;
  onApprove: () => void;
  onReject: () => void;
  loading: boolean;
}

const difficultyConfig = {
  beginner: { label: "Beginner", color: "text-emerald-400", bg: "bg-emerald-400/10 border-emerald-400/25" },
  intermediate: { label: "Intermediate", color: "text-amber-400", bg: "bg-amber-400/10 border-amber-400/25" },
  advanced: { label: "Advanced", color: "text-rose-400", bg: "bg-rose-400/10 border-rose-400/25" },
};

export function PlanApproval({
  plan,
  pdfFileName,
  onApprove,
  onReject,
  loading,
}: PlanApprovalProps) {
  const diff = difficultyConfig[plan.overallDifficulty];

  return (
    <div className="w-full max-w-2xl mx-auto space-y-4">
      <div className="text-center space-y-1 mb-6">
        <div className="inline-flex items-center gap-2 text-xs font-mono uppercase tracking-widest text-slate-500 mb-3">
          <div className="w-6 h-px bg-slate-600" />
          Learning Plan Ready
          <div className="w-6 h-px bg-slate-600" />
        </div>
        <h2 className="text-xl font-semibold text-white">
          Review Your Lesson Plan
        </h2>
        <p className="text-sm text-slate-400">
          Generated from{" "}
          <span className="text-slate-300 font-medium">{pdfFileName}</span>
        </p>
      </div>

      <div className="rounded-xl border border-white/10 bg-white/3 overflow-hidden">
        <div className="px-5 py-4 border-b border-white/8 flex items-center justify-between gap-4">
          <p className="text-sm text-slate-300 leading-relaxed flex-1">
            {plan.summary}
          </p>
          <div className="flex-shrink-0 flex flex-col items-end gap-1.5">
            <span className={`text-xs font-mono uppercase tracking-wider px-2.5 py-1 rounded-md border ${diff.bg} ${diff.color}`}>
              {diff.label}
            </span>
            <span className="text-xs text-slate-500 font-mono">
              ~{plan.estimatedMinutes} min
            </span>
          </div>
        </div>

        <div className="p-4 space-y-3">
          <p className="text-xs font-mono uppercase tracking-widest text-slate-500 mb-3">
            Learning Objectives ({plan.objectives.length})
          </p>
          {plan.objectives.map((obj, idx) => {
            const objDiff = difficultyConfig[obj.difficulty];
            return (
              <div
                key={obj.id}
                className="flex gap-3 p-3 rounded-lg bg-white/3 border border-white/8 hover:border-white/12 transition-colors"
              >
                <div className="flex-shrink-0 w-6 h-6 rounded-md bg-indigo-500/20 border border-indigo-500/25 flex items-center justify-center mt-0.5">
                  <span className="text-indigo-300 text-xs font-bold font-mono">
                    {idx + 1}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="text-sm font-semibold text-white">{obj.title}</p>
                    <span className={`text-[10px] font-mono uppercase px-1.5 py-0.5 rounded border ${objDiff.bg} ${objDiff.color}`}>
                      {objDiff.label}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed mb-2">
                    {obj.description}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {obj.keyTopics.map((topic) => (
                      <span
                        key={topic}
                        className="text-[10px] px-2 py-0.5 rounded-full bg-white/5 border border-white/8 text-slate-400"
                      >
                        {topic}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="px-4 py-3 border-t border-white/8 flex items-center gap-6 bg-white/2">
          <div className="text-center">
            <p className="text-lg font-bold text-white font-mono">
              {plan.objectives.length}
            </p>
            <p className="text-[10px] text-slate-500 uppercase tracking-wider">
              Objectives
            </p>
          </div>
          <div className="text-center">
            <p className="text-lg font-bold text-white font-mono">
              {plan.objectives.length * 3}
            </p>
            <p className="text-[10px] text-slate-500 uppercase tracking-wider">
              Questions
            </p>
          </div>
          <div className="text-center">
            <p className="text-lg font-bold text-white font-mono">
              ~{plan.estimatedMinutes}
            </p>
            <p className="text-[10px] text-slate-500 uppercase tracking-wider">
              Minutes
            </p>
          </div>
        </div>
      </div>

      <div className="flex gap-3">
        <button
          onClick={onReject}
          disabled={loading}
          className="px-5 py-2.5 rounded-lg border border-white/10 text-slate-400 hover:text-slate-200 hover:border-white/20 text-sm font-medium transition-all disabled:opacity-40"
        >
          Cancel
        </button>
        <button
          onClick={onApprove}
          disabled={loading}
          className="flex-1 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.98] flex items-center justify-center gap-2"
        >
          {loading ? (
            <>
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Generating quiz questions...
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Approve & Start Learning
            </>
          )}
        </button>
      </div>
    </div>
  );
}
