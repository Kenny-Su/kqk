import { NextResponse } from "next/server";
import { findCompanyById, insertFiling } from "@/lib/db";
import { downloadFiling } from "@/lib/sec";
import type { RecentSecFiling } from "@/lib/types";

export const runtime = "nodejs";

type Params = {
  params: Promise<{ id: string }>;
};

export async function POST(_request: Request, { params }: Params) {
  const { id } = await params;
  const company = findCompanyById(Number(id));

  if (!company) {
    return NextResponse.json({ error: "Company not found." }, { status: 404 });
  }

  try {
    const recent = (await _request.json()) as Partial<RecentSecFiling> & { force?: boolean };

    if (!recent.accessionNumber || !recent.primaryDocument || !recent.formType || !recent.filingDate) {
      return NextResponse.json(
        { error: "Choose a SEC filing to load first." },
        { status: 400 }
      );
    }

    const cached = await downloadFiling({
      cik: company.cik,
      accessionNumber: recent.accessionNumber,
      primaryDocument: recent.primaryDocument,
      force: recent.force
    });

    const filing = insertFiling({
      companyId: company.id,
      accessionNumber: recent.accessionNumber,
      formType: recent.formType,
      filingDate: recent.filingDate,
      periodEndDate: recent.periodEndDate ?? null,
      secUrl: cached.secUrl,
      localPath: cached.localPath,
      title: recent.title ?? null
    });

    return NextResponse.json({ filing });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load filing." },
      { status: 500 }
    );
  }
}
