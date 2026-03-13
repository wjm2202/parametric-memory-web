import { NextResponse } from "next/server";

const startTime = Date.now();

export async function GET() {
  return NextResponse.json(
    {
      status: "ok",
      version: process.env.npm_package_version || "0.1.0",
      commit: process.env.GIT_COMMIT_SHA || "unknown",
      uptime: Math.floor((Date.now() - startTime) / 1000),
      timestamp: new Date().toISOString(),
    },
    {
      status: 200,
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
