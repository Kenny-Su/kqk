import { readFile } from "node:fs/promises";
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

  try {
    const html = await readFile(result.filing.localPath, "utf8");
    const archiveBase = result.filing.secUrl.slice(0, result.filing.secUrl.lastIndexOf("/") + 1);
    const withBase = html.replace(/<head([^>]*)>/i, `<head$1><base href="${archiveBase}">`);

    return new NextResponse(withBase, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "private, max-age=3600"
      }
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not read cached filing HTML." },
      { status: 500 }
    );
  }
}
