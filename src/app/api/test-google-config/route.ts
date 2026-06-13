import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;
  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;

  return NextResponse.json({
    GOOGLE_CLIENT_ID: clientId ? `Present (length: ${clientId.length})` : "Missing",
    GOOGLE_CLIENT_SECRET: clientSecret ? `Present (length: ${clientSecret.length})` : "Missing",
    GOOGLE_REFRESH_TOKEN: refreshToken ? `Present (length: ${refreshToken.length})` : "Missing",
    GOOGLE_DRIVE_FOLDER_ID: folderId ? `Present (length: ${folderId.length})` : "Missing",
    GOOGLE_SERVICE_ACCOUNT_EMAIL: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL ? "Present (Deprecated)" : "Missing",
    GOOGLE_PRIVATE_KEY: process.env.GOOGLE_PRIVATE_KEY ? "Present (Deprecated)" : "Missing",
  });
}
