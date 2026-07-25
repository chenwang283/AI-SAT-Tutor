const { createClient } = require("@supabase/supabase-js");

function configError(message) {
  const error = new Error(message);
  error.code = "CONFIG_ERROR";
  error.statusCode = 500;
  return error;
}

function getSupabaseConfig() {
  const url = process.env.SUPABASE_URL?.trim();
  const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY?.trim();

  if (!url) throw configError("SUPABASE_URL is not set.");
  if (!publishableKey) throw configError("SUPABASE_PUBLISHABLE_KEY is not set.");
  return { url, publishableKey };
}

function baseClientOptions() {
  return {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  };
}

function createPublicSupabaseClient() {
  const { url, publishableKey } = getSupabaseConfig();
  return createClient(url, publishableKey, baseClientOptions());
}

function createUserSupabaseClient(accessToken) {
  const { url, publishableKey } = getSupabaseConfig();
  return createClient(url, publishableKey, {
    ...baseClientOptions(),
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}

function getBearerToken(req) {
  const match = (req.get("authorization") || "").match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

async function requireAuthenticatedUser(req, res, next) {
  const accessToken = getBearerToken(req);
  if (!accessToken) {
    return res.status(401).json({
      error: { code: "AUTH_REQUIRED", message: "Sign in to continue." },
    });
  }

  try {
    const supabase = createPublicSupabaseClient();
    const { data, error } = await supabase.auth.getUser(accessToken);
    if (error || !data?.user) {
      return res.status(401).json({
        error: { code: "INVALID_SESSION", message: "Your session has expired. Sign in again." },
      });
    }

    req.auth = {
      accessToken,
      user: data.user,
      supabase: createUserSupabaseClient(accessToken),
    };
    return next();
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  configError,
  getSupabaseConfig,
  createPublicSupabaseClient,
  createUserSupabaseClient,
  getBearerToken,
  requireAuthenticatedUser,
};
