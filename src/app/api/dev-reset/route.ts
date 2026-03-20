import { NextResponse } from "next/server";
import { resetStore } from "@/lib/store";

export async function POST() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ ok: false, message: "not allowed in production" }, { status: 403 });
  }

  await resetStore();
  return NextResponse.json({ ok: true });
}
