import { NextResponse } from "next/server";
import { findCompanyById } from "@/lib/db";
import { getRecentFilings } from "@/lib/sec";

export const runtime = "nodejs";

type Params = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  const company = findCompanyById(Number(id));

  if (!company) {
    return NextResponse.json({ error: "Company not found." }, { status: 404 });
  }

  try {
    const filings = await getRecentFilings(company.cik);
    return NextResponse.json({ filings });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch SEC filing list." },
      { status: 500 }
    );
  }
}
