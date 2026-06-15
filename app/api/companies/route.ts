import { NextResponse } from "next/server";
import { listCompanies, upsertCompany } from "@/lib/db";
import { resolveCompany } from "@/lib/sec";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({ companies: listCompanies() });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { identifier?: string };
    const companyInput = await resolveCompany(body.identifier ?? "");
    const company = upsertCompany(companyInput);
    return NextResponse.json({ company });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to add company." },
      { status: 400 }
    );
  }
}
