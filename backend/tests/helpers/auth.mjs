import assert from "node:assert/strict";

/**
 * Register a fresh user and return the login payload (accessToken, user, ...).
 * Usernames are derived from `role` + timestamp so tests never collide.
 */
export async function register(baseUrl, role, displayName = role) {
  const n = `${role}-${Date.now()}-${Math.floor(Math.random() * 1e4)}`;
  const suffix = n.replace(/[^a-zA-Z0-9]/g, "_").slice(0, 28);
  const email = `${suffix}@example.com`;
  const res = await fetch(`${baseUrl}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email,
      username: suffix,
      password: "SecurePass123!",
      displayName,
    }),
  });
  assert.equal(res.status, 201, `register ${role} should succeed`);
  const data = await res.json();
  return { ...data, email, password: "SecurePass123!", id: data.user.id };
}

/** Login and return a fresh access token. */
export async function login(baseUrl, { email, password }) {
  const res = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  assert.equal(res.status, 200);
  return (await res.json()).accessToken;
}

/** Register + login in one step; returns the access token. */
export async function registerAndLogin(baseUrl, role = "media") {
  const user = await register(baseUrl, role);
  return login(baseUrl, user);
}