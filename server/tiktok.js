'use strict';

// TikTok-Anbindung (Login Kit + Display API). Die Endpunkte bitte im Entwicklerportal prüfen.
const crypto = require('crypto');

const AUTH_URL = 'https://www.tiktok.com/v2/auth/authorize/';
const TOKEN_URL = 'https://open.tiktokapis.com/v2/oauth/token/';
const VIDEO_LIST_URL =
  'https://open.tiktokapis.com/v2/video/list/?fields=id,title,create_time,like_count,comment_count,share_count,view_count';
const SCOPES = 'user.info.basic,video.list';

function config() {
  return {
    clientKey: process.env.TIKTOK_CLIENT_KEY || '',
    clientSecret: process.env.TIKTOK_CLIENT_SECRET || '',
    redirectUri: process.env.TIKTOK_REDIRECT_URI || '',
  };
}

function isConfigured() {
  const c = config();
  return !!(c.clientKey && c.clientSecret && c.redirectUri);
}

// Offene Anmeldungen: state -> { userId, verifier, expires }. Nur kurz gültig.
const pending = new Map();

function startAuth(userId) {
  const state = crypto.randomBytes(16).toString('hex');
  const verifier = crypto.randomBytes(32).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  pending.set(state, { userId, verifier, expires: Date.now() + 10 * 60 * 1000 });
  const c = config();
  const params = new URLSearchParams({
    client_key: c.clientKey,
    scope: SCOPES,
    response_type: 'code',
    redirect_uri: c.redirectUri,
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
  });
  return `${AUTH_URL}?${params.toString()}`;
}

function takeAuth(state) {
  const entry = pending.get(state);
  pending.delete(state);
  if (!entry || entry.expires < Date.now()) return null;
  return entry;
}

async function postForm(url, fields) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(fields),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) {
    throw new Error(data.error_description || (typeof data.error === 'string' ? data.error : 'TikTok hat die Anfrage abgelehnt.'));
  }
  return data;
}

async function exchangeCode(code, verifier) {
  const c = config();
  return postForm(TOKEN_URL, {
    client_key: c.clientKey,
    client_secret: c.clientSecret,
    code,
    grant_type: 'authorization_code',
    redirect_uri: c.redirectUri,
    code_verifier: verifier,
  });
}

async function refreshAccess(refreshToken) {
  const c = config();
  return postForm(TOKEN_URL, {
    client_key: c.clientKey,
    client_secret: c.clientSecret,
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  });
}

// Antwort von TikTok in Zeilen für die Datenbank umwandeln.
function tokenRow(data) {
  const now = Date.now();
  return {
    open_id: data.open_id || null,
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: now + Number(data.expires_in || 0) * 1000,
    refresh_expires_at: now + Number(data.refresh_expires_in || 0) * 1000,
    scope: data.scope || SCOPES,
  };
}

async function listVideos(accessToken, maxCount = 20) {
  const res = await fetch(VIDEO_LIST_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
    body: JSON.stringify({ max_count: maxCount }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || (data.error && data.error.code && data.error.code !== 'ok')) {
    throw new Error((data.error && data.error.message) || 'Die Videos konnten nicht geladen werden.');
  }
  return ((data.data && data.data.videos) || []).map((v) => ({
    id: v.id,
    title: v.title || '',
    createdAt: v.create_time ? new Date(v.create_time * 1000).toISOString() : null,
    likes: v.like_count || 0,
    comments: v.comment_count || 0,
    views: v.view_count || 0,
  }));
}

module.exports = {
  isConfigured, startAuth, takeAuth, exchangeCode, refreshAccess, tokenRow, listVideos,
};
