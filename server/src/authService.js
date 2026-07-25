const { createPublicSupabaseClient, createUserSupabaseClient } = require("./supabaseClient");

function requestError(statusCode, code, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

function cleanEmail(value) {
  const email = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw requestError(400, "INVALID_EMAIL", "Enter a valid email address.");
  }
  return email;
}

function cleanPassword(value) {
  const password = typeof value === "string" ? value : "";
  if (!password) throw requestError(400, "INVALID_PASSWORD", "Enter a password.");
  return password;
}

function publicAppUrl() {
  return (process.env.PUBLIC_APP_URL || "http://localhost:3000").replace(/\/+$/, "");
}

function serializeSession(session, user) {
  if (!session?.access_token || !session?.refresh_token) return null;
  return {
    accessToken: session.access_token,
    refreshToken: session.refresh_token,
    expiresAt: session.expires_at || null,
    expiresIn: session.expires_in || null,
    user: user ? { id: user.id, email: user.email || null } : null,
  };
}

async function signUp({ email, password }) {
  const supabase = createPublicSupabaseClient();
  const { data, error } = await supabase.auth.signUp({
    email: cleanEmail(email),
    password: cleanPassword(password),
    options: { emailRedirectTo: `${publicAppUrl()}/auth/confirmed` },
  });
  if (error) throw requestError(error.status || 400, "SIGNUP_FAILED", error.message);

  return {
    requiresEmailConfirmation: Boolean(data?.user && !data?.session),
    session: serializeSession(data?.session, data?.user),
  };
}

async function signIn({ email, password }) {
  const supabase = createPublicSupabaseClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: cleanEmail(email),
    password: cleanPassword(password),
  });
  if (error) throw requestError(error.status || 401, "LOGIN_FAILED", error.message);
  return serializeSession(data.session, data.user);
}

async function refreshSession({ refreshToken }) {
  const token = typeof refreshToken === "string" ? refreshToken.trim() : "";
  if (!token) throw requestError(400, "INVALID_REQUEST", "Refresh token is required.");

  const supabase = createPublicSupabaseClient();
  const { data, error } = await supabase.auth.refreshSession({ refresh_token: token });
  if (error) throw requestError(error.status || 401, "REFRESH_FAILED", error.message);
  return serializeSession(data.session, data.user);
}

async function signOut({ accessToken, refreshToken }) {
  if (!accessToken || !refreshToken) return;
  const supabase = createUserSupabaseClient(accessToken);
  const { error } = await supabase.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
  });
  if (!error) await supabase.auth.signOut();
}

async function requestPasswordReset({ email }) {
  const supabase = createPublicSupabaseClient();
  const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail(email), {
    redirectTo: `${publicAppUrl()}/auth/reset`,
  });
  if (error) throw requestError(error.status || 400, "RESET_FAILED", error.message);
}

async function updatePassword({ accessToken, refreshToken, password }) {
  if (!accessToken || !refreshToken) {
    throw requestError(400, "INVALID_RECOVERY_LINK", "This password recovery link is incomplete.");
  }

  const supabase = createUserSupabaseClient(accessToken);
  const { error: sessionError } = await supabase.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
  });
  if (sessionError) {
    throw requestError(401, "INVALID_RECOVERY_LINK", "This password recovery link is invalid or expired.");
  }

  const { error } = await supabase.auth.updateUser({ password: cleanPassword(password) });
  if (error) throw requestError(error.status || 400, "PASSWORD_UPDATE_FAILED", error.message);
}

module.exports = {
  signUp,
  signIn,
  refreshSession,
  signOut,
  requestPasswordReset,
  updatePassword,
  serializeSession,
};
