import { NextResponse, type NextRequest } from "next/server";
import { finishSignIn, getCustomerContext, safeNext, SIGN_IN_PATH } from "@/lib/account";

// Email confirmation and password-reset links land here (ADR-022). PKCE: the ?code= can only be
// exchanged by the browser that asked for the email (it holds the code verifier cookie).
// The destination comes from a fixed list, never from the URL as given (open-redirect risk).
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const next = safeNext(request.nextUrl.searchParams.get("next"));
  const context = await getCustomerContext();

  if (code && context && (await context.session.exchangeCode(code)) && (await finishSignIn())) {
    return NextResponse.redirect(new URL(next, request.url));
  }
  return NextResponse.redirect(new URL(`${SIGN_IN_PATH}?link=expired`, request.url));
}
