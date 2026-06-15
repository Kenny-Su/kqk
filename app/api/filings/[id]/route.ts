import { NextResponse } from "next/server";
import { getFilingWithCompany } from "@/lib/db";

export const runtime = "nodejs";

type Params = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  const result = getFilingWithCompany(Number(id));

  if (!result) {
    return NextResponse.json({ error: "Filing not found." }, { status: 404 });
  }

  return NextResponse.json(result);
}
