import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin-auth";

export async function GET() { return await isAdmin() ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "Não autorizado." }, { status: 401 }); }
