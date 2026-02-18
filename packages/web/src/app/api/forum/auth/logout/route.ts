import { NextResponse } from "next/server";

export async function POST() {
  const response = NextResponse.json({ loggedOut: true });

  // Delete the httpOnly auth cookie
  response.cookies.set("lobstr_api_key", "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 0, // Expire immediately
  });

  return response;
}
