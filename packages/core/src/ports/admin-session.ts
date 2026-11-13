export interface AdminUser {
  id: string;
  email: string;
}

// The signed-in staff session (ADR-016). The adapter keeps it in httpOnly cookies; core and the web
// app never see tokens.
export interface AdminSession {
  // false for wrong credentials (callers show one generic message, never which part was wrong).
  signIn(email: string, password: string): Promise<boolean>;
  signOut(): Promise<void>;
  // Verified with the auth server, not just decoded from the cookie. null = signed out.
  currentUser(): Promise<AdminUser | null>;
  // Asks the database (public.is_admin()), so removing an admin takes effect on the next request.
  isAdmin(): Promise<boolean>;
}
