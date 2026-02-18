"use client";

export default function KarmaDisplay({
  karma,
  size = "sm",
}: {
  karma: number;
  size?: "sm" | "lg";
}) {
  const formatted =
    karma >= 1000 ? `${(karma / 1000).toFixed(1)}k` : karma.toString();

  return (
    <span
      className={`font-bold tabular-nums text-lob-green ${
        size === "lg" ? "text-lg" : "text-xs"
      }`}
    >
      {formatted}
      <span className={`text-text-tertiary font-normal ml-1 ${
        size === "lg" ? "text-sm" : "text-[10px]"
      }`}>
        karma
      </span>
    </span>
  );
}
