// Thin wrapper around Supabase Auth for the per-person login screen.
// Accounts are created by the farm admin in the Supabase Dashboard
// (Authentication -> Users -> Add User) -- there's no self-signup.
import { supabase } from './storage.js';

export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data.session;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function getSession() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session;
}

// Calls `callback(session)` immediately with the current state and again on
// every sign-in/sign-out/token refresh. Returns the subscription to clean up.
export function onAuthStateChange(callback) {
  const { data } = supabase.auth.onAuthStateChange((_event, session) => callback(session));
  return data.subscription;
}
