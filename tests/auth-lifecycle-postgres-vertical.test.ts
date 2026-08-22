import assert from 'node:assert/strict';
import { createSign, generateKeyPairSync } from 'node:crypto';
import { once } from 'node:events';
import { createServer, type Server } from 'node:http';
import test from 'node:test';
import { Pool } from 'pg';
import sharp from 'sharp';
import { createProductionCore } from '../server/core/composition/createProductionCore.ts';
import type { CoreServerConfig } from '../server/core/config.ts';
import { createNodeHttpAdapter } from '../server/core/http/nodeHttpAdapter.ts';
import { migrateTransactionSchema } from '../server/transactions/infrastructure/postgres/transactionSchemaMigrator.ts';
import { migrateMaskArtifactSchema } from '../server/core/artifacts/maskArtifactSchema.ts';
import { migrateImageArtifactSchema } from '../server/core/artifacts/imageArtifactSchema.ts';
import { migrateProjectSchema } from '../server/core/projects/projectSchema.ts';
import { migrateAuthSchema } from '../server/core/auth/authSchema.ts';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required: auth lifecycle acceptance must use real PostgreSQL');

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const googleJwk = { ...(publicKey.export({ format: 'jwk' }) as any), kid: 'auth-lifecycle-key', alg: 'RS256', use: 'sig' };
const config: CoreServerConfig = Object.freeze({
  nodeEnv: 'production', port: 8080, databaseUrl, provider: 'FAL', falKey: 'auth-lifecycle-fal-must-not-run',
  falBaseUrl: 'https://provider.auth-lifecycle.test', jwtSecret: 'auth-lifecycle-jwt-secret', jwtIssuer: 'auth-lifecycle', jwtAudience: 'auth-lifecycle-core',
  authChallengeSecret: 'auth-lifecycle-challenge-secret', authDefaultTenantId: 'public-auth-tenant', authPublicOrigin: 'http://localhost',
  resendApiKey: 'resend-test-secret', authEmailFrom: 'Bers Auth <auth@example.test>', googleOauthClientId: 'google-client-id', googleOauthClientSecret: 'google-client-secret',
  artifactSigningSecret: 'auth-lifecycle-artifact-secret', trustedAssetHosts: Object.freeze([]), allowLegacyAssetUrls: false,
  allowedWebOrigins: Object.freeze(['http://localhost']), hardBudgetCredits: 1, creditsPerEdit: 1,
  bodyLimitBytes: 64_000, maskUploadLimitBytes: 64_000, maskMaxDimension: 256,
  imageUploadLimitBytes: 1_000_000, imageMaxDimension: 256, imageMaxPixels: 65_536,
  requestTimeoutMs: 5_000, providerTimeoutMs: 2_000, shutdownTimeoutMs: 2_000,
});

type Mail = { to: string; subject: string; text: string; authorization: string; idempotencyKey: string };
type Running = Awaited<ReturnType<typeof start>>;
const oauthTokens = new Map<string, string>();
const mails: Mail[] = [];
let providerCalls = 0;
let tokenExchanges = 0;
let nowMs = Date.UTC(2026, 7, 22, 6, 0, 0);

function signGoogle(claims: Record<string, unknown>, key = privateKey, kid = 'auth-lifecycle-key') {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const header = encode({ alg: 'RS256', typ: 'JWT', kid });
  const payload = encode(claims);
  const signer = createSign('RSA-SHA256'); signer.update(`${header}.${payload}`); signer.end();
  const signature = signer.sign(key).toString('base64url');
  return `${header}.${payload}.${signature}`;
}

const fetcher: typeof fetch = async (input, init) => {
  const url = String(input);
  if (url === 'https://api.resend.com/emails') {
    const body = JSON.parse(String(init?.body ?? '{}')) as { to?: string[]; subject?: string; text?: string };
    mails.push({
      to: String(body.to?.[0] ?? ''), subject: String(body.subject ?? ''), text: String(body.text ?? ''),
      authorization: new Headers(init?.headers).get('authorization') ?? '', idempotencyKey: new Headers(init?.headers).get('idempotency-key') ?? '',
    });
    return new Response(JSON.stringify({ id: `mail-${mails.length}` }), { status: 200, headers: { 'content-type': 'application/json' } });
  }
  if (url === 'https://oauth2.googleapis.com/token') {
    tokenExchanges++;
    const form = new URLSearchParams(String(init?.body ?? ''));
    assert.equal(form.get('client_id'), config.googleOauthClientId);
    assert.equal(form.get('client_secret'), config.googleOauthClientSecret);
    assert.equal(form.get('redirect_uri'), 'http://localhost/api/core/auth/callback/google');
    const idToken = oauthTokens.get(String(form.get('code')));
    return idToken ? new Response(JSON.stringify({ id_token: idToken }), { status: 200, headers: { 'content-type': 'application/json' } }) : new Response('{}', { status: 400 });
  }
  if (url === 'https://www.googleapis.com/oauth2/v3/certs') {
    return new Response(JSON.stringify({ keys: [googleJwk] }), { status: 200, headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=300' } });
  }
  providerCalls++;
  throw new Error(`auth lifecycle acceptance must not call creative provider: ${url}`);
};

async function start() {
  const production = await createProductionCore(config, { fetcher, now: () => nowMs });
  const server = createServer(createNodeHttpAdapter({ core: production.core, artifacts: production.artifacts, projects: production.projects, auth: production.auth, config, ready: async () => true, accepting: () => true }));
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const address = server.address(); assert(address && typeof address === 'object');
  return { production, server, baseUrl: `http://127.0.0.1:${address.port}` };
}
async function stop(running: Running) { await new Promise<void>((resolve,reject)=>running.server.close(error=>error?reject(error):resolve())); await running.production.close(); }
async function post(baseUrl: string, path: string, body: unknown, token?: string) {
  return fetch(`${baseUrl}${path}`, { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
}
function verificationCode(mail: Mail) { const code = /\b(\d{6})\b/.exec(mail.text)?.[1]; assert(code); return code; }
function resetToken(mail: Mail) { const value = /https?:\/\/\S+/.exec(mail.text)?.[0]; assert(value); const token = new URL(value).searchParams.get('token'); assert(token); return token; }
function googleStart(location: string) { const url = new URL(location); assert.equal(url.origin, 'https://accounts.google.com'); assert.equal(url.pathname, '/o/oauth2/v2/auth'); const state=url.searchParams.get('state'),nonce=url.searchParams.get('nonce'); assert(state&&nonce); return { state, nonce }; }
async function startGoogle(running: Running, returnTo = '/projects') {
  const response = await fetch(`${running.baseUrl}/api/core/auth/login/google?return_to=${encodeURIComponent(returnTo)}`, { redirect: 'manual' });
  assert.equal(response.status, 302); const location=response.headers.get('location'); assert(location); return googleStart(location);
}
function claims(nonce: string, overrides: Record<string, unknown> = {}) { return { iss:'https://accounts.google.com',aud:config.googleOauthClientId,sub:'google-subject',exp:Math.floor(nowMs/1000)+3600,nonce,email:'oauthuser@gmail.com',email_verified:true,name:'OAuth User',...overrides }; }

async function createProject(running: Running, token: string, name: string) {
  const png = await sharp({ create: { width: 3, height: 2, channels: 4, background: { r: 12, g: 34, b: 56, alpha: 1 } } }).png().toBuffer();
  return fetch(`${running.baseUrl}/api/core/projects?name=${encodeURIComponent(name)}`, { method:'POST', headers:{ authorization:`Bearer ${token}`,'content-type':'image/png' }, body:png });
}

test('registration, verification, recovery and Google OAuth are canonical PostgreSQL auth authorities', async t => {
  const pool = new Pool({ connectionString: databaseUrl, max: 4, application_name: 'auth-lifecycle-postgres-acceptance' });
  await migrateTransactionSchema(pool); await migrateMaskArtifactSchema(pool); await migrateImageArtifactSchema(pool); await migrateProjectSchema(pool); await migrateAuthSchema(pool);
  const truncate = () => pool.query('TRUNCATE canonical_auth_browser_grants,canonical_auth_oauth_states,canonical_auth_oauth_identities,canonical_auth_password_resets,canonical_auth_email_verifications,canonical_auth_sessions,canonical_auth_password_credentials,canonical_auth_users,canonical_projects,canonical_image_artifacts,canonical_mask_artifacts,transaction_journal,reservation_journal_sequences,credit_reservations,credit_wallets RESTART IDENTITY CASCADE');
  await truncate(); mails.length=0; oauthTokens.clear(); providerCalls=0; tokenExchanges=0; nowMs=Date.UTC(2026,7,22,6,0,0);
  let running = await start();
  t.after(async()=>{ await stop(running).catch(()=>undefined); await truncate(); await pool.end(); });

  const email='localuser@gmail.com', password='correct horse battery staple', newPassword='new correct horse battery staple';
  const registration=await post(running.baseUrl,'/api/core/auth/register',{email,password,displayName:'Local User'});
  assert.equal(registration.status,202); assert.deepEqual(await registration.json(),{status:'verification_required'}); assert.equal(mails.length,1);
  assert.equal(mails[0].authorization,`Bearer ${config.resendApiKey}`); assert.ok(mails[0].idempotencyKey);
  const firstCode=verificationCode(mails[0]); const pending=(await pool.query('SELECT * FROM canonical_auth_users WHERE email_normalized=$1',[email])).rows[0];
  assert.equal(pending.status,'pending_verification'); assert.equal(pending.tenant_id,config.authDefaultTenantId); assert.equal(await running.production.auth.store.activeSessionCount(pending.user_id),0);
  const challenge=(await pool.query('SELECT challenge_digest FROM canonical_auth_email_verifications WHERE user_id=$1',[pending.user_id])).rows[0]; assert.equal(Buffer.from(challenge.challenge_digest).byteLength,32); assert.equal(JSON.stringify(challenge).includes(firstCode),false);
  assert.equal((await post(running.baseUrl,'/api/core/auth/password/login',{email,password})).status,401);
  const wrong=await post(running.baseUrl,'/api/core/auth/verify-otp',{email,otpCode:'000000'===firstCode?'999999':'000000'}); assert.equal(wrong.status,400); assert.equal(await running.production.auth.store.activeSessionCount(pending.user_id),0);

  nowMs += 61_000;
  const resend=await post(running.baseUrl,'/api/core/auth/resend-otp',{email}); assert.equal(resend.status,202); assert.deepEqual(await resend.json(),{status:'accepted'}); assert.equal(mails.length,2);
  const secondCode=verificationCode(mails[1]);
  if(secondCode!==firstCode) assert.equal((await post(running.baseUrl,'/api/core/auth/verify-otp',{email,otpCode:firstCode})).status,400,'previous verification code must be invalid after resend');
  const verified=await post(running.baseUrl,'/api/core/auth/verify-otp',{email,otpCode:secondCode}); assert.equal(verified.status,200); const verifiedBody=await verified.json() as any; const localToken=String(verifiedBody.access_token);
  assert.equal(verifiedBody.user.email_verified,true); assert.equal(verifiedBody.user.id,pending.user_id); assert.equal(await running.production.auth.store.activeSessionCount(pending.user_id),1);
  assert.equal((await post(running.baseUrl,'/api/core/auth/verify-otp',{email,otpCode:secondCode})).status,400,'verification is single-use');
  assert.equal((await createProject(running,localToken,'Local Auth Project')).status,201);

  const expEmail='expired@example.test'; const expRegister=await post(running.baseUrl,'/api/core/auth/register',{email:expEmail,password}); assert.equal(expRegister.status,202); const expCode=verificationCode(mails[mails.length-1]); const expUser=(await pool.query('SELECT user_id FROM canonical_auth_users WHERE email_normalized=$1',[expEmail])).rows[0];
  nowMs += 10*60_000+1; assert.equal((await post(running.baseUrl,'/api/core/auth/verify-otp',{email:expEmail,otpCode:expCode})).status,400); assert.equal(await running.production.auth.store.activeSessionCount(expUser.user_id),0);

  const existingReset=await post(running.baseUrl,'/api/core/auth/password/reset-request',{email}); const existingResetBody=await existingReset.json(); const mailCountAfterExisting=mails.length;
  const unknownReset=await post(running.baseUrl,'/api/core/auth/password/reset-request',{email:'missing@example.test'}); assert.equal(unknownReset.status,202); assert.deepEqual(await unknownReset.json(),existingResetBody); assert.equal(mails.length,mailCountAfterExisting);
  const resetMail=mails[mailCountAfterExisting-1]; const reset=resetToken(resetMail); assert.equal(JSON.stringify(existingResetBody).includes(reset),false);
  const resetRow=(await pool.query('SELECT token_digest FROM canonical_auth_password_resets WHERE user_id=$1 ORDER BY created_at DESC LIMIT 1',[pending.user_id])).rows[0]; assert.equal(Buffer.from(resetRow.token_digest).byteLength,32); assert.equal(JSON.stringify(resetRow).includes(reset),false);
  const passwordReset=await post(running.baseUrl,'/api/core/auth/password/reset',{resetToken:reset,newPassword}); assert.equal(passwordReset.status,200);
  assert.equal((await fetch(`${running.baseUrl}/api/core/auth/context`,{headers:{authorization:`Bearer ${localToken}`}})).status,401,'password reset revokes existing bearer sessions');
  assert.equal((await post(running.baseUrl,'/api/core/auth/password/login',{email,password})).status,401,'old password must fail');
  const newLogin=await post(running.baseUrl,'/api/core/auth/password/login',{email,newPassword}); assert.equal(newLogin.status,200); const newLocalToken=String((await newLogin.json() as any).access_token);
  assert.equal((await post(running.baseUrl,'/api/core/auth/password/reset',{resetToken:reset,newPassword:'another secure password'})).status,400,'reset token is single-use');
  assert.equal((await fetch(`${running.baseUrl}/api/core/projects`,{headers:{authorization:`Bearer ${newLocalToken}`}})).status,200);

  const noStateTokenCalls=tokenExchanges; const badState=await fetch(`${running.baseUrl}/api/core/auth/callback/google?state=invalid-state&code=never`,{redirect:'manual'}); assert.equal(badState.status,401); assert.equal(tokenExchanges,noStateTokenCalls);
  async function rejectedGoogle(code:string,tokenFactory:(nonce:string)=>string){ const flow=await startGoogle(running); oauthTokens.set(code,tokenFactory(flow.nonce)); const response=await fetch(`${running.baseUrl}/api/core/auth/callback/google?state=${encodeURIComponent(flow.state)}&code=${encodeURIComponent(code)}`,{redirect:'manual'}); assert.equal(response.status,401); }
  await rejectedGoogle('bad-nonce',nonce=>signGoogle(claims('different-nonce')));
  await rejectedGoogle('bad-audience',nonce=>signGoogle(claims(nonce,{aud:'wrong-audience'})));
  await rejectedGoogle('bad-issuer',nonce=>signGoogle(claims(nonce,{iss:'https://evil.example'})));
  await rejectedGoogle('expired-google',nonce=>signGoogle(claims(nonce,{exp:Math.floor(nowMs/1000)-1})));
  const badKey=generateKeyPairSync('rsa',{modulusLength:2048}).privateKey;
  await rejectedGoogle('bad-signature',nonce=>signGoogle(claims(nonce),badKey));

  const linkFlow=await startGoogle(running,'/projects'); oauthTokens.set('link-local',signGoogle(claims(linkFlow.nonce,{sub:'linked-google-sub',email})));
  const linkCallback=await fetch(`${running.baseUrl}/api/core/auth/callback/google?state=${encodeURIComponent(linkFlow.state)}&code=link-local`,{redirect:'manual'}); assert.equal(linkCallback.status,302); const linkLocation=new URL(String(linkCallback.headers.get('location'))); assert.equal(linkLocation.origin,config.authPublicOrigin); assert.equal(linkLocation.pathname,'/projects'); assert.equal(linkLocation.searchParams.has('access_token'),false); const linkGrant=linkLocation.searchParams.get('auth_code'); assert(linkGrant);
  const linkExchange=await post(running.baseUrl,'/api/core/auth/exchange',{code:linkGrant}); assert.equal(linkExchange.status,200); const linkBody=await linkExchange.json() as any; assert.equal(linkBody.user.id,pending.user_id,'authoritative Gmail must link to existing verified local account');
  assert.equal((await post(running.baseUrl,'/api/core/auth/exchange',{code:linkGrant})).status,401,'browser grant is single-use');

  await running.production.auth.store.provisionLocalUser({tenantId:config.authDefaultTenantId,userId:'custom-local',email:'person@corp.example',password:'custom local secure password'});
  const unsafeFlow=await startGoogle(running); oauthTokens.set('unsafe-link',signGoogle(claims(unsafeFlow.nonce,{sub:'unsafe-google-sub',email:'person@corp.example',email_verified:true,hd:undefined})));
  const unsafe=await fetch(`${running.baseUrl}/api/core/auth/callback/google?state=${encodeURIComponent(unsafeFlow.state)}&code=unsafe-link`,{redirect:'manual'}); assert.equal(unsafe.status,409); assert.equal((await unsafe.json() as any).code,'oauth_account_link_required');

  const googleFlow=await startGoogle(running,'/projects'); oauthTokens.set('good-google',signGoogle(claims(googleFlow.nonce,{sub:'new-google-sub',email:'newoauth@gmail.com'})));
  const googleCallback=await fetch(`${running.baseUrl}/api/core/auth/callback/google?state=${encodeURIComponent(googleFlow.state)}&code=good-google`,{redirect:'manual'}); assert.equal(googleCallback.status,302); const googleLocation=new URL(String(googleCallback.headers.get('location'))); const googleGrant=googleLocation.searchParams.get('auth_code'); assert(googleGrant); assert.equal(googleLocation.searchParams.has('access_token'),false);
  const googleExchange=await post(running.baseUrl,'/api/core/auth/exchange',{code:googleGrant}); assert.equal(googleExchange.status,200); const googleBody=await googleExchange.json() as any; const googleToken=String(googleBody.access_token); assert.equal(googleBody.user.email,'newoauth@gmail.com');
  assert.equal((await createProject(running,googleToken,'Google Auth Project')).status,201); assert.equal((await fetch(`${running.baseUrl}/api/core/projects`,{headers:{authorization:`Bearer ${googleToken}`}})).status,200);
  assert.equal((await pool.query("SELECT count(*)::int AS count FROM canonical_auth_oauth_identities WHERE provider='google' AND provider_subject='new-google-sub'")).rows[0].count,1);

  await stop(running); running=await start();
  assert.equal((await fetch(`${running.baseUrl}/api/core/auth/context`,{headers:{authorization:`Bearer ${googleToken}`}})).status,200);
  assert.equal((await post(running.baseUrl,'/api/core/auth/exchange',{code:googleGrant})).status,401);
  assert.equal((await post(running.baseUrl,'/api/core/auth/password/reset',{resetToken:reset,newPassword:'yet another secure password'})).status,400);
  assert.equal((await pool.query("SELECT count(*)::int AS count FROM canonical_auth_oauth_identities WHERE provider='google' AND provider_subject='new-google-sub'")).rows[0].count,1);

  for(const secret of [config.resendApiKey,config.googleOauthClientSecret,config.authChallengeSecret,firstCode,reset]) assert.equal(JSON.stringify([existingResetBody,verifiedBody,googleBody]).includes(secret),false);
  assert.equal(providerCalls,0); assert.equal(Number((await pool.query('SELECT count(*)::int AS count FROM credit_reservations')).rows[0].count),0);
});
