import { NextResponse } from "next/server";
export async function GET() {
  return NextResponse.json(
    { error: "Form registrations queue is retired. Use /superadmin/approvals." },
    { status: 410 },
  );
}
export async function PATCH() {
  return GET();
}
