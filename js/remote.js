import { supabase, isSupabaseConfigured } from './supabase.js';
import { mergeLobbyPayload } from './lobby-merge.js';

export function isRemoteMode() {
  return isSupabaseConfigured && supabase !== null;
}

function mapProfile(row) {
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    pseudo: row.pseudo,
    avatar: row.avatar || '🎤',
    isGuest: row.is_guest,
    createdAt: row.created_at ? new Date(row.created_at).getTime() : Date.now(),
  };
}

function lobbyRow(lobby) {
  return {
    id: lobby.id,
    code: lobby.code,
    payload: lobby,
    member_ids: lobby.memberIds || [],
    updated_at: new Date().toISOString(),
  };
}

export async function restoreAuthSession() {
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session?.user) return null;
  return getProfileByAuthId(data.session.user.id);
}

export async function getProfileById(profileId) {
  const { data, error } = await supabase.from('profiles').select('*').eq('id', profileId).maybeSingle();
  if (error) throw error;
  return mapProfile(data);
}

export async function getProfileByAuthId(authUserId) {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('auth_user_id', authUserId)
    .maybeSingle();
  if (error) throw error;
  return mapProfile(data);
}

export async function createGuestProfile({ pseudo, avatar }) {
  const { data, error } = await supabase
    .from('profiles')
    .insert({ pseudo, avatar: avatar || '🎤', is_guest: true })
    .select()
    .single();
  if (error) throw error;
  return mapProfile(data);
}

export async function signupWithAuth({ email, password, pseudo, avatar }) {
  const { data: authData, error: authError } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { pseudo, avatar } },
  });
  if (authError) throw authError;
  if (!authData.user) throw new Error('Inscription impossible.');

  const existing = await getProfileByAuthId(authData.user.id);
  if (existing) {
    return { profile: existing, needsEmailConfirmation: !authData.session };
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .insert({
      auth_user_id: authData.user.id,
      email: email.toLowerCase().trim(),
      pseudo,
      avatar: avatar || '🎤',
      is_guest: false,
    })
    .select()
    .single();

  if (profileError) {
    if (profileError.code === '23505') {
      const byAuth = await getProfileByAuthId(authData.user.id);
      if (byAuth) return { profile: byAuth, needsEmailConfirmation: !authData.session };
    }
    throw profileError;
  }
  return {
    profile: mapProfile(profile),
    needsEmailConfirmation: !authData.session,
  };
}

export async function loginWithAuth({ email, password }) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  const profile = await getProfileByAuthId(data.user.id);
  if (!profile) throw new Error('Profil introuvable. Réessaie de t\'inscrire.');
  return profile;
}

export async function logoutAuth() {
  await supabase.auth.signOut();
}

export async function insertLobby(lobby) {
  const { error } = await supabase.from('lobbies').insert(lobbyRow(lobby));
  if (error) throw error;
  return lobby;
}

export async function saveLobby(lobby) {
  const server = await fetchLobbyById(lobby.id);
  const merged = server ? mergeLobbyPayload(server, lobby) : lobby;
  const { error } = await supabase.from('lobbies').update(lobbyRow(merged)).eq('id', merged.id);
  if (error) throw error;
  return merged;
}

export async function fetchLobbyById(id) {
  const { data, error } = await supabase.from('lobbies').select('payload').eq('id', id).maybeSingle();
  if (error) throw error;
  return data?.payload ?? null;
}

export async function fetchLobbyByCode(code) {
  const { data, error } = await supabase
    .from('lobbies')
    .select('payload')
    .eq('code', code.toUpperCase().trim())
    .maybeSingle();
  if (error) throw error;
  return data?.payload ?? null;
}

export async function fetchUserLobbies(userId) {
  const { data, error } = await supabase
    .from('lobbies')
    .select('payload')
    .contains('member_ids', [userId])
    .order('updated_at', { ascending: false });
  if (error) {
    const { data: fallback, error: err2 } = await supabase
      .from('lobbies')
      .select('payload')
      .order('updated_at', { ascending: false });
    if (err2) throw err2;
    return (fallback || [])
      .map((r) => r.payload)
      .filter((l) => l?.memberIds?.includes(userId));
  }
  return (data || []).map((r) => r.payload);
}

export async function deleteLobbyById(lobbyId) {
  const { error } = await supabase.from('lobbies').delete().eq('id', lobbyId);
  if (error) throw error;
}

export async function isCodeTaken(code) {
  const { data, error } = await supabase.from('lobbies').select('id').eq('code', code).maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

export function subscribeToLobby(lobbyId, onUpdate, onDeleted) {
  const channel = supabase
    .channel(`lobby:${lobbyId}`)
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'lobbies', filter: `id=eq.${lobbyId}` },
      (payload) => {
        if (payload.new?.payload) onUpdate(payload.new.payload);
      }
    )
    .on(
      'postgres_changes',
      { event: 'DELETE', schema: 'public', table: 'lobbies', filter: `id=eq.${lobbyId}` },
      () => {
        if (onDeleted) onDeleted();
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

export function mapAuthError(err) {
  const msg = err?.message || String(err);
  if (msg.includes('Invalid login credentials')) return 'Email ou mot de passe incorrect.';
  if (msg.includes('User already registered')) return 'Cet email est déjà utilisé.';
  if (msg.includes('Password should be at least')) return 'Mot de passe : 6 caractères minimum.';
  if (msg.includes('Unable to validate email')) return 'Email invalide.';
  return msg;
}
