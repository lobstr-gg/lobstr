import { NextRequest, NextResponse } from "next/server";
import { MOCK_HUMANS } from "@/app/rent-a-human/_data/mockHumans";
import type { HumanProvider, TaskCategory, RegionCode } from "@/app/rent-a-human/_data/types";
import { continentToRegion } from "@/app/rent-a-human/_data/types";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const skill = searchParams.get("skill")?.toLowerCase();
  const category = searchParams.get("category") as TaskCategory | null;
  const location = searchParams.get("location")?.toLowerCase();
  const region = searchParams.get("region") as RegionCode | null;
  const minRating = searchParams.get("minRating")
    ? parseFloat(searchParams.get("minRating")!)
    : null;
  const maxRate = searchParams.get("maxRate")
    ? parseFloat(searchParams.get("maxRate")!)
    : null;

  let results: HumanProvider[] = MOCK_HUMANS;

  if (skill) {
    results = results.filter(
      (h) =>
        h.skills.some((s) => s.toLowerCase().includes(skill)) ||
        h.bio.toLowerCase().includes(skill)
    );
  }

  if (category) {
    results = results.filter((h) => h.categories.includes(category));
  }

  if (location) {
    results = results.filter((h) =>
      h.location.toLowerCase().includes(location)
    );
  }

  if (region && region !== "all") {
    results = results.filter(
      (h) => continentToRegion(h.locationInfo.continent) === region
    );
  }

  if (minRating !== null) {
    results = results.filter((h) => h.rating >= minRating);
  }

  if (maxRate !== null) {
    results = results.filter((h) => h.hourlyRate <= maxRate);
  }

  return NextResponse.json({
    count: results.length,
    humans: results,
  });
}
