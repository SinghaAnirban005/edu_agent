"use client";

import React, { useCallback, useRef, useState } from "react";

interface UploadZoneProps {
  onUpload: (file: File) => void;
  loading: boolean;
}

export function UploadZone({ onUpload, loading }: UploadZoneProps) {
  const [dragActive, setDragActive] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(e.type === "dragenter" || e.type === "dragover");
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragActive(false);
      const file = e.dataTransfer.files[0];
      if (file && file.name.endsWith(".pdf")) onUpload(file);
    },
    [onUpload]
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) onUpload(file);
    },
    [onUpload]
  );

  return (
    <div className="w-full max-w-2xl mx-auto">
      <div className="text-center mb-10 space-y-3">
        <div className="inline-flex items-center gap-2 text-xs font-mono uppercase tracking-widest text-slate-500 mb-2">
          <div className="w-8 h-px bg-slate-700" />
          AI Learning Agent
          <div className="w-8 h-px bg-slate-700" />
        </div>
        <h1 className="text-3xl font-bold text-white tracking-tight">
          Transform any PDF into<br />
          <span className="bg-gradient-to-r from-indigo-400 to-sky-400 bg-clip-text text-transparent">
            an interactive lesson
          </span>
        </h1>
        <p className="text-slate-400 text-sm max-w-md mx-auto leading-relaxed">
          Upload a PDF document. The agent will analyze it, propose a structured
          learning plan, and guide you through adaptive MCQ quizzes.
        </p>
      </div>

      <div
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        onClick={() => !loading && inputRef.current?.click()}
        className={`relative rounded-2xl border-2 border-dashed p-12 text-center cursor-pointer transition-all duration-200 ${
          dragActive
            ? "border-indigo-400 bg-indigo-500/8"
            : "border-white/15 bg-white/2 hover:border-white/25 hover:bg-white/4"
        } ${loading ? "opacity-60 cursor-not-allowed pointer-events-none" : ""}`}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".pdf"
          onChange={handleChange}
          className="hidden"
          disabled={loading}
        />

        {loading ? (
          <div className="space-y-4">
            <div className="w-12 h-12 mx-auto border-2 border-indigo-500/30 border-t-indigo-400 rounded-full animate-spin" />
            <div className="space-y-1">
              <p className="text-white font-medium">Analyzing your PDF...</p>
              <p className="text-slate-400 text-sm">
                Extracting content and generating your learning plan
              </p>
            </div>
            <div className="flex items-center justify-center gap-1.5">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse"
                  style={{ animationDelay: `${i * 150}ms` }}
                />
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center">
              <svg
                className={`w-7 h-7 transition-colors ${
                  dragActive ? "text-indigo-400" : "text-slate-400"
                }`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m6.75 12l-3-3m0 0l-3 3m3-3v6m-1.5-15H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
                />
              </svg>
            </div>
            <div>
              <p className="text-white font-medium mb-1">
                {dragActive ? "Drop your PDF here" : "Drop PDF here or click to upload"}
              </p>
              <p className="text-slate-500 text-xs">Text-based PDFs only • Max 10MB</p>
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-wrap justify-center gap-2 mt-6">
        {[
          "🔍 Smart content extraction",
          "🎯 Adaptive learning objectives",
          "✅ Interactive MCQ quizzes",
          "💡 Socratic hints",
          "📊 Progress tracking",
        ].map((feature) => (
          <span
            key={feature}
            className="text-xs px-3 py-1.5 rounded-full bg-white/3 border border-white/8 text-slate-400"
          >
            {feature}
          </span>
        ))}
      </div>
    </div>
  );
}
