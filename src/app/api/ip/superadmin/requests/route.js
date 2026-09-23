import { NextResponse } from "next/server";
export async function GET() {
  return NextResponse.json(
    { error: "Manual employer requests queue is retired. Use /superadmin/approvals." },
    { status: 410 },
  );
}
export async function POST() {
  return GET();
}
export async function PATCH() {
  return GET();
}
