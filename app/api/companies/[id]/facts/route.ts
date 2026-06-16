import { NextResponse } from "next/server";
import { findCompanyById } from "@/lib/db";
import { getCompanyFinancialFacts } from "@/lib/sec";
import type { FinancialFactsResponse } from "@/lib/types";

export const runtime = "nodejs";

type Params = {
  params: Promise<{ id: string }>;
};

export async function GET(request: Request, { params }: Params) {
  const { id } = await params;
  const company = findCompanyById(Number(id));

  if (!company) {
    return NextResponse.json({ error: "Company not found." }, { status: 404 });
  }

  try {
    const url = new URL(request.url);
    const facts = await getCompanyFinancialFacts({
      cik: company.cik,
      force: url.searchParams.get("force") === "true"
    });
    const response: FinancialFactsResponse = {
      company,
      ...facts
    };

    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not fetch financial facts."
      },
      { status: 500 }
    );
  }
}
