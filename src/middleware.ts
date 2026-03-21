import { NextRequest, NextResponse } from "next/server";

function unauthorized() {
  return new NextResponse("Authentication required", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="LP Dashboard"',
    },
  });
}

export function middleware(request: NextRequest) {
  const username = process.env.DASHBOARD_USERNAME;
  const password = process.env.DASHBOARD_PASSWORD;

  if (!username || !password) {
    return NextResponse.next();
  }

  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Basic ")) {
    return unauthorized();
  }

  try {
    const base64Credentials = authHeader.split(" ")[1] || "";
    const credentials = atob(base64Credentials);
    const [inputUsername, ...rest] = credentials.split(":");
    const inputPassword = rest.join(":");

    if (inputUsername !== username || inputPassword !== password) {
      return unauthorized();
    }

    return NextResponse.next();
  } catch {
    return unauthorized();
  }
}

export const config = {
  matcher: ["/dashboard/:path*", "/api/daily-summary/:path*"],
};
