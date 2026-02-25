"use client";

interface AnalysisFormProps {
  prompt: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

export function AnalysisForm({
  prompt,
  value,
  onChange,
  disabled,
}: AnalysisFormProps) {
  const charCount = value.trim().length;
  const isValid = charCount >= 100;

  return (
    <div className="rounded-lg border border-white/10 bg-white/5 p-5">
      <h3 className="mb-2 text-sm font-semibold text-white/90">
        Written Analysis
      </h3>
      <p className="mb-4 text-sm text-white/60">{prompt}</p>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        rows={8}
        placeholder="Write your analysis of the evidence here..."
        className="w-full resize-y rounded-md border border-white/10 bg-black/30 px-4 py-3 text-sm text-white/90 placeholder:text-white/30 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500/50 disabled:cursor-not-allowed disabled:opacity-50"
      />
      <div className="mt-2 flex items-center justify-between">
        <p
          className={`text-xs ${
            isValid ? "text-green-400" : "text-white/40"
          }`}
        >
          {charCount} / 100 min characters
        </p>
        {!isValid && charCount > 0 && (
          <p className="text-xs text-amber-400">
            {100 - charCount} more characters needed
          </p>
        )}
      </div>
    </div>
  );
}
