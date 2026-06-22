import { NextResponse } from "next/server";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { deleteCompanyById, findCompanyById } from "@/lib/db";
import { DATA_DIR } from "@/lib/paths";

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

  return NextResponse.json({ company });
}

export async function DELETE(_request: Request, { params }: Params) {
  const { id } = await params;
  const company = findCompanyById(Number(id));

  if (!company) {
    return NextResponse.json({ error: "Company not found." }, { status: 404 });
  }

  deleteCompanyById(company.id);

  await rm(join(DATA_DIR, "sec-cache", company.cik), {
    force: true,
    recursive: true
  });

  return NextResponse.json({ ok: true });
}
