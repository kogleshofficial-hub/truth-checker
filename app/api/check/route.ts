import { NextResponse } from "next/server";

// The app now searches public Wikipedia references and runs the model in the visitor's browser.
export async function POST() {
  return NextResponse.json(
    { success: false, error: "The paid server-side AI and search endpoint has been retired. Reload Truth Checker to use its free local-AI mode." },
    { status: 410 }
  );
}
