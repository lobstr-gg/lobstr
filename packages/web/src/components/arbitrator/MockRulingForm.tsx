"use client";

interface MockRulingFormProps {
  selected: string | null;
  onSelect: (ruling: string) => void;
  disabled?: boolean;
}

export function MockRulingForm({
  selected,
  onSelect,
  disabled,
}: MockRulingFormProps) {
  const options = [
    {
      value: "BuyerWins",
      label: "Buyer Wins",
      description: "The buyer should receive a full refund.",
    },
    {
      value: "SellerWins",
      label: "Seller Wins",
      description: "The seller fulfilled their obligations.",
    },
  ];

  return (
    <div className="rounded-lg border border-white/10 bg-white/5 p-5">
      <h3 className="mb-2 text-sm font-semibold text-white/90">Mock Ruling</h3>
      <p className="mb-4 text-sm text-white/60">
        Based on your analysis of the evidence, cast your ruling.
      </p>
      <div className="grid grid-cols-2 gap-3">
        {options.map((opt) => (
          <button
            key={opt.value}
            onClick={() => onSelect(opt.value)}
            disabled={disabled}
            className={`rounded-lg border p-4 text-left transition-colors ${
              selected === opt.value
                ? "border-orange-500 bg-orange-500/10"
                : "border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/10"
            } ${disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}
          >
            <p
              className={`text-sm font-semibold ${
                selected === opt.value ? "text-orange-300" : "text-white/80"
              }`}
            >
              {opt.label}
            </p>
            <p className="mt-1 text-xs text-white/50">{opt.description}</p>
          </button>
        ))}
      </div>
    </div>
  );
}
