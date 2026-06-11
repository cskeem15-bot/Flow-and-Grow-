// Thin wrapper around Supabase Auth for the per-person login screen.
// Crew members can create their own accounts from the login screen, but new
// accounts start "pending" and can't see field data until an existing admin
// approves them from Setup -> Pending Requests (see user_status table in
// supabase/schema.sql).
import { supabase } from './storage.js';

export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data.session;
}

export async function signUp(email, password) {
  const { data, error } = await supabase.auth.signUp({ email, password });
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

// The signed-in user's row in user_status: { status: 'pending'|'approved'|'declined', is_admin, ... }
export async function getUserStatus(userId) {
  const { data, error } = await supabase
    .from('user_status')
    .select('*')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

// Admin-only: every account that has requested access, oldest first.
export async function listAllUsers() {
  const { data, error } = await supabase
    .from('user_status')
    .select('*')
    .order('requested_at', { ascending: true });
  if (error) throw error;
  return data || [];
}

// Admin-only: approve or decline a pending account.
export async function decideUser(userId, approve) {
  const { error } = await supabase
    .from('user_status')
    .update({ status: approve ? 'approved' : 'declined', decided_at: new Date().toISOString() })
    .eq('id', userId);
  if (error) throw error;
}

// Admin-only: promote/demote another approved user between admin and standard.
export async function setUserAdmin(userId, isAdmin) {
  const { error } = await supabase
    .from('user_status')
    .update({ is_admin: isAdmin })
    .eq('id', userId);
  if (error) throw error;
}
