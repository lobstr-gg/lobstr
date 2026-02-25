"use client";

interface MCQuestionCardProps {
  index: number;
  question: string;
  options: string[];
  selectedAnswer: number | null;
  onSelect: (questionIndex: number, optionIndex: number) => void;
  disabled?: boolean;
}

export function MCQuestionCard({
  index,
  question,
  options,
  selectedAnswer,
  onSelect,
  disabled,
}: MCQuestionCardProps) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/5 p-5">
      <p className="mb-3 text-sm font-medium text-white/90">
        <span className="text-orange-400">Q{index + 1}.</span> {question}
      </p>
      <div className="space-y-2">
        {options.map((option, i) => (
          <button
            key={i}
            onClick={() => onSelect(index, i)}
            disabled={disabled}
            className={`w-full rounded-md border px-4 py-2.5 text-left text-sm transition-colors ${
              selectedAnswer === i
                ? "border-orange-500 bg-orange-500/10 text-orange-300"
                : "border-white/10 bg-white/5 text-white/70 hover:border-white/20 hover:bg-white/10"
            } ${disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}
          >
            <span className="mr-2 inline-block w-5 text-white/40">
              {String.fromCharCode(65 + i)}.
            </span>
            {option}
          </button>
        ))}
      </div>
    </div>
  );
}
