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
const csrfHeader = 'x-bers-csrf-token';
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
const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

function signGoogle(claims: Record<string, unknown>, key = privateKey, kid = 'auth-lifecycle-key') {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const header = encode({ alg: 'RS256', typ: 'JWT', kid });
  const payload = encode(claims);
  const signer = createSign('RSA-SHA256'); signer.update(`${header}.${payload}`); signer.end();
  return `${header}.${payload}.${signer.sign(key).toString('base64url')}`;
}
function nonCanonicalAlias(token: string) {
  const parts=token.split('.'); const signature=parts[2]; const index=alphabet.indexOf(signature.at(-1)!); assert.ok(index>=0);
  const alias=`${signature.slice(0,-1)}${alphabet[index|1]}`; assert.notEqual(alias,signature); assert.deepEqual(Buffer.from(alias,'base64url'),Buffer.from(signature,'base64url'));
  return `${parts[0]}.${parts[1]}.${alias}`;
}

const fetcher: typeof fetch = async (input, init) => {
  const url = String(input);
  if (url === 'https://api.resend.com/emails') {
    const body = JSON.parse(String(init?.body ?? '{}')) as { to?: string[]; subject?: string; text?: string };
    mails.push({ to:String(body.to?.[0]??''),subject:String(body.subject??''),text:String(body.text??''),authorization:new Headers(init?.headers).get('authorization')??'',idempotencyKey:new Headers(init?.headers).get('idempotency-key')??'' });
    return new Response(JSON.stringify({ id:`mail-${mails.length}` }),{status:200,headers:{'content-type':'application/json'}});
  }
  if (url === 'https://oauth2.googleapis.com/token') {
    tokenExchanges++; const form=new URLSearchParams(String(init?.body??''));
    assert.equal(form.get('client_id'),config.googleOauthClientId); assert.equal(form.get('client_secret'),config.googleOauthClientSecret); assert.equal(form.get('redirect_uri'),'http://localhost/api/core/auth/callback/google');
    const idToken=oauthTokens.get(String(form.get('code'))); return idToken?new Response(JSON.stringify({id_token:idToken}),{status:200,headers:{'content-type':'application/json'}}):new Response('{}',{status:400});
  }
  if (url === 'https://www.googleapis.com/oauth2/v3/certs') return new Response(JSON.stringify({keys:[googleJwk]}),{status:200,headers:{'content-type':'application/json','cache-control':'public, max-age=300'}});
  providerCalls++; throw new Error(`auth lifecycle acceptance must not call creative provider: ${url}`);
};

async function start() {
  const production=await createProductionCore(config,{fetcher,now:()=>nowMs});
  const server=createServer(createNodeHttpAdapter({core:production.core,artifacts:production.artifacts,projects:production.projects,auth:production.auth,config,ready:async()=>true,accepting:()=>true,now:()=>nowMs}));
  server.listen(0,'127.0.0.1'); await once(server,'listening'); const address=server.address(); assert(address&&typeof address==='object');
  return {production,server,baseUrl:`http://127.0.0.1:${address.port}`};
}
async function stop(running:Running){await new Promise<void>((resolve,reject)=>running.server.close(error=>error?reject(error):resolve()));await running.production.close();}
function browser(cookie?:string,extra:Record<string,string>={}){return{origin:'http://localhost','sec-fetch-site':'same-origin',...(cookie?{cookie}:{}),...extra};}
async function post(baseUrl:string,path:string,body:unknown,cookie?:string){return fetch(`${baseUrl}${path}`,{method:'POST',headers:browser(cookie,{'content-type':'application/json'}),body:JSON.stringify(body)});}
function sessionCookie(response:Response){const raw=response.headers.get('set-cookie');assert(raw,'successful auth must issue browser cookie');assert.match(raw,/^bers_session_dev=/);assert.match(raw,/HttpOnly/);assert.match(raw,/SameSite=Strict/);assert.match(raw,/Path=\//);return raw.split(';',1)[0];}
function csrfToken(response:Response){const value=response.headers.get(csrfHeader);assert(value,'successful browser session must expose anti-forgery proof');assert.match(value,/^[A-Za-z0-9_-]{43}$/);return value;}
function verificationCode(mail:Mail){const code=/\b(\d{6})\b/.exec(mail.text)?.[1];assert(code);return code;}
function resetToken(mail:Mail){const value=/https?:\/\/\S+/.exec(mail.text)?.[0];assert(value);const url=new URL(value);assert.equal(url.searchParams.has('token'),false);const token=new URLSearchParams(url.hash.slice(1)).get('token');assert(token);return token;}
function googleStart(location:string){const url=new URL(location);assert.equal(url.origin,'https://accounts.google.com');assert.equal(url.pathname,'/o/oauth2/v2/auth');const state=url.searchParams.get('state'),nonce=url.searchParams.get('nonce');assert(state&&nonce);return{state,nonce};}
async function startGoogle(running:Running,returnTo='/projects'){const response=await fetch(`${running.baseUrl}/api/core/auth/login/google?return_to=${encodeURIComponent(returnTo)}`,{redirect:'manual',headers:browser()});assert.equal(response.status,302);const location=response.headers.get('location');assert(location);return googleStart(location);}
function claims(nonce:string,overrides:Record<string,unknown>={}){return{iss:'https://accounts.google.com',aud:config.googleOauthClientId,sub:'google-subject',exp:Math.floor(nowMs/1000)+3600,nonce,email:'oauthuser@gmail.com',email_verified:true,name:'OAuth User',...overrides};}
async function createProject(running:Running,cookie:string,csrf:string,name:string){const png=await sharp({create:{width:3,height:2,channels:4,background:{r:12,g:34,b:56,alpha:1}}}).png().toBuffer();return fetch(`${running.baseUrl}/api/core/projects?name=${encodeURIComponent(name)}`,{method:'POST',headers:browser(cookie,{'content-type':'image/png',[csrfHeader]:csrf}),body:png});}
async function register(running:Running,email:string,password:string){const response=await post(running.baseUrl,'/api/core/auth/register',{email,password});assert.equal(response.status,202);assert.equal(response.headers.get('set-cookie'),null);const body=await response.json() as any;assert.equal(body.status,'verification_required');assert.match(String(body.verification_handle),/^[A-Za-z0-9_-]{40,128}$/);return body;}
async function callback(running:Running,flow:{state:string;nonce:string},code:string,idToken:string){oauthTokens.set(code,idToken);return fetch(`${running.baseUrl}/api/core/auth/callback/google?state=${encodeURIComponent(flow.state)}&code=${encodeURIComponent(code)}`,{redirect:'manual',headers:browser()});}

test('registration, recovery and Google OAuth remain fail-closed against account takeover and secret leakage',async t=>{
  const pool=new Pool({connectionString:databaseUrl,max:4,application_name:'auth-lifecycle-postgres-acceptance'});
  await migrateTransactionSchema(pool);await migrateMaskArtifactSchema(pool);await migrateImageArtifactSchema(pool);await migrateProjectSchema(pool);await migrateAuthSchema(pool);
  const truncate=()=>pool.query('TRUNCATE canonical_auth_browser_grants,canonical_auth_oauth_states,canonical_auth_oauth_identities,canonical_auth_password_resets,canonical_auth_email_verifications,canonical_auth_sessions,canonical_auth_password_credentials,canonical_auth_users,canonical_projects,canonical_image_artifacts,canonical_mask_artifacts,transaction_journal,reservation_journal_sequences,credit_reservations,credit_wallets RESTART IDENTITY CASCADE');
  await truncate();mails.length=0;oauthTokens.clear();providerCalls=0;tokenExchanges=0;nowMs=Date.UTC(2026,7,22,6,0,0);let running=await start();
  t.after(async()=>{await stop(running).catch(()=>undefined);await truncate();await pool.end();});

  const email='localuser@gmail.com',ownerPassword='correct horse battery staple',attackerPassword='attacker cannot take this account',newPassword='new correct horse battery staple';
  const ownerAttempt1=await register(running,email,ownerPassword);assert.equal(mails.length,1);const ownerCode1=verificationCode(mails[0]);
  assert.equal(mails[0].authorization,`Bearer ${config.resendApiKey}`);assert.ok(mails[0].idempotencyKey);
  const pending=(await pool.query('SELECT * FROM canonical_auth_users WHERE email_normalized=$1',[email])).rows[0];assert.equal(pending.status,'pending_verification');assert.equal(pending.tenant_id,config.authDefaultTenantId);
  const firstCredential=(await pool.query('SELECT salt,password_hash FROM canonical_auth_password_credentials WHERE user_id=$1',[pending.user_id])).rows[0];
  const firstChallenge=(await pool.query('SELECT challenge_digest,verification_handle_digest FROM canonical_auth_email_verifications WHERE user_id=$1',[pending.user_id])).rows[0];
  assert.equal(Buffer.from(firstChallenge.challenge_digest).byteLength,32);assert.equal(Buffer.from(firstChallenge.verification_handle_digest).byteLength,32);assert.equal(JSON.stringify(firstChallenge).includes(ownerCode1),false);assert.equal(JSON.stringify(firstChallenge).includes(ownerAttempt1.verification_handle),false);
  assert.equal((await post(running.baseUrl,'/api/core/auth/password/login',{email,password:ownerPassword})).status,401);

  const mailsBeforeRace=mails.length;const raceCooldown=await register(running,email,attackerPassword);assert.notEqual(raceCooldown.verification_handle,ownerAttempt1.verification_handle);assert.equal(mails.length,mailsBeforeRace);
  const credentialAfterCooldownRace=(await pool.query('SELECT salt,password_hash FROM canonical_auth_password_credentials WHERE user_id=$1',[pending.user_id])).rows[0];assert.deepEqual(credentialAfterCooldownRace,firstCredential);
  assert.equal((await post(running.baseUrl,'/api/core/auth/verify-otp',{email,otpCode:ownerCode1,verificationHandle:raceCooldown.verification_handle})).status,400,'OTP cannot be borrowed by another browser attempt');

  nowMs+=61_000;const attackerAttempt=await register(running,email,attackerPassword);assert.equal(mails.length,mailsBeforeRace+1);const attackerCode=verificationCode(mails.at(-1)!);
  assert.equal((await post(running.baseUrl,'/api/core/auth/verify-otp',{email,otpCode:ownerCode1,verificationHandle:ownerAttempt1.verification_handle})).status,400,'superseded owner attempt must be invalid');
  assert.equal((await post(running.baseUrl,'/api/core/auth/verify-otp',{email,otpCode:attackerCode,verificationHandle:ownerAttempt1.verification_handle})).status,400,'email OTP alone cannot activate attacker credential');

  nowMs+=61_000;const ownerAttempt2=await register(running,email,ownerPassword);assert.equal(mails.length,mailsBeforeRace+2);const ownerCode2=verificationCode(mails.at(-1)!);
  nowMs+=61_000;const mailsBeforeWrongResend=mails.length;const wrongResend=await post(running.baseUrl,'/api/core/auth/resend-otp',{email,verificationHandle:attackerAttempt.verification_handle});assert.equal(wrongResend.status,202);assert.equal(mails.length,mailsBeforeWrongResend);
  const resend=await post(running.baseUrl,'/api/core/auth/resend-otp',{email,verificationHandle:ownerAttempt2.verification_handle});assert.equal(resend.status,202);assert.equal(mails.length,mailsBeforeWrongResend+1);const ownerResentCode=verificationCode(mails.at(-1)!);
  assert.equal((await post(running.baseUrl,'/api/core/auth/verify-otp',{email,otpCode:ownerCode2,verificationHandle:ownerAttempt2.verification_handle})).status,400,'resend invalidates previous OTP');
  const verified=await post(running.baseUrl,'/api/core/auth/verify-otp',{email,otpCode:ownerResentCode,verificationHandle:ownerAttempt2.verification_handle});assert.equal(verified.status,200);const localCookie=sessionCookie(verified);const localCsrf=csrfToken(verified);const verifiedBody=await verified.json() as any;assert.equal('access_token' in verifiedBody,false);assert.equal('token_type' in verifiedBody,false);assert.equal(verifiedBody.user.email_verified,true);assert.equal(verifiedBody.user.id,pending.user_id);
  assert.equal((await post(running.baseUrl,'/api/core/auth/password/login',{email,password:attackerPassword})).status,401);const ownerLogin=await post(running.baseUrl,'/api/core/auth/password/login',{email,password:ownerPassword});assert.equal(ownerLogin.status,200);assert.equal('access_token' in await ownerLogin.json(),false);assert.ok(csrfToken(ownerLogin));
  assert.equal((await createProject(running,localCookie,localCsrf,'Local Auth Project')).status,201);

  const activeMailCount=mails.length;const activeRegistration=await register(running,email,attackerPassword);assert.equal(mails.length,activeMailCount);assert.ok(activeRegistration.verification_handle);const activeOwnerLogin=await post(running.baseUrl,'/api/core/auth/password/login',{email,password:ownerPassword});assert.equal(activeOwnerLogin.status,200);assert.ok(sessionCookie(activeOwnerLogin));assert.ok(csrfToken(activeOwnerLogin));assert.equal((await post(running.baseUrl,'/api/core/auth/password/login',{email,password:attackerPassword})).status,401);

  const expEmail='expired@example.test';const expAttempt=await register(running,expEmail,ownerPassword);const expCode=verificationCode(mails.at(-1)!);const expUser=(await pool.query('SELECT user_id FROM canonical_auth_users WHERE email_normalized=$1',[expEmail])).rows[0];nowMs+=10*60_000+1;
  assert.equal((await post(running.baseUrl,'/api/core/auth/verify-otp',{email:expEmail,otpCode:expCode,verificationHandle:expAttempt.verification_handle})).status,400);assert.equal(await running.production.auth.store.activeSessionCount(expUser.user_id),0);

  const existingReset=await post(running.baseUrl,'/api/core/auth/password/reset-request',{email});const existingResetBody=await existingReset.json();const mailCountAfterExisting=mails.length;
  const unknownReset=await post(running.baseUrl,'/api/core/auth/password/reset-request',{email:'missing@example.test'});assert.equal(unknownReset.status,202);assert.deepEqual(await unknownReset.json(),existingResetBody);assert.equal(mails.length,mailCountAfterExisting);
  const reset=resetToken(mails[mailCountAfterExisting-1]);assert.equal(JSON.stringify(existingResetBody).includes(reset),false);
  const resetRow=(await pool.query('SELECT token_digest FROM canonical_auth_password_resets WHERE user_id=$1 ORDER BY created_at DESC LIMIT 1',[pending.user_id])).rows[0];assert.equal(Buffer.from(resetRow.token_digest).byteLength,32);assert.equal(JSON.stringify(resetRow).includes(reset),false);
  const passwordReset=await post(running.baseUrl,'/api/core/auth/password/reset',{resetToken:reset,newPassword},localCookie);assert.equal(passwordReset.status,200);assert.match(String(passwordReset.headers.get('set-cookie')),/^bers_session_dev=;/);assert.equal(passwordReset.headers.get(csrfHeader),'');assert.equal((await fetch(`${running.baseUrl}/api/core/auth/context`,{headers:browser(localCookie)})).status,401);
  assert.equal((await post(running.baseUrl,'/api/core/auth/password/login',{email,password:ownerPassword})).status,401);const newLogin=await post(running.baseUrl,'/api/core/auth/password/login',{email,password:newPassword});assert.equal(newLogin.status,200);const newLocalCookie=sessionCookie(newLogin);const newLocalCsrf=csrfToken(newLogin);const newLoginBody=await newLogin.json() as any;assert.equal('access_token' in newLoginBody,false);
  assert.equal((await post(running.baseUrl,'/api/core/auth/password/reset',{resetToken:reset,newPassword:'another secure password'})).status,400);const newContext=await fetch(`${running.baseUrl}/api/core/auth/context`,{headers:browser(newLocalCookie)});assert.equal(newContext.status,200);assert.equal(csrfToken(newContext),newLocalCsrf);

  const noStateTokenCalls=tokenExchanges;const badState=await fetch(`${running.baseUrl}/api/core/auth/callback/google?state=invalid-state&code=never`,{redirect:'manual',headers:browser()});assert.equal(badState.status,401);assert.equal(tokenExchanges,noStateTokenCalls);assert.equal(badState.headers.get('set-cookie'),null);
  async function rejectedGoogle(code:string,tokenFactory:(nonce:string)=>string){const flow=await startGoogle(running);const response=await callback(running,flow,code,tokenFactory(flow.nonce));assert.equal(response.status,401);assert.equal(response.headers.get('set-cookie'),null);}
  await rejectedGoogle('bad-nonce',()=>signGoogle(claims('different-nonce')));await rejectedGoogle('bad-audience',nonce=>signGoogle(claims(nonce,{aud:'wrong-audience'})));await rejectedGoogle('bad-issuer',nonce=>signGoogle(claims(nonce,{iss:'https://evil.example'})));await rejectedGoogle('expired-google',nonce=>signGoogle(claims(nonce,{exp:Math.floor(nowMs/1000)-1})));await rejectedGoogle('unverified-google',nonce=>signGoogle(claims(nonce,{email_verified:false})));
  const badKey=generateKeyPairSync('rsa',{modulusLength:2048}).privateKey;await rejectedGoogle('bad-signature',nonce=>signGoogle(claims(nonce),badKey));await rejectedGoogle('noncanonical-signature',nonce=>nonCanonicalAlias(signGoogle(claims(nonce))));

  const redirectFlow=await startGoogle(running,'/\\evil.example/steal');const redirectResponse=await callback(running,redirectFlow,'safe-redirect',signGoogle(claims(redirectFlow.nonce,{sub:'redirect-user',email:'redirectuser@gmail.com'})));assert.equal(redirectResponse.status,302);const safeLocation=new URL(String(redirectResponse.headers.get('location')));assert.equal(safeLocation.origin,config.authPublicOrigin);assert.equal(safeLocation.pathname,'/');assert.equal(safeLocation.search,'');assert.equal(safeLocation.hash,'');assert.ok(sessionCookie(redirectResponse));assert.ok(csrfToken(redirectResponse));

  const linkFlow=await startGoogle(running,'/projects');const linkCallback=await callback(running,linkFlow,'link-local',signGoogle(claims(linkFlow.nonce,{sub:'linked-google-sub',email})));assert.equal(linkCallback.status,302);const linkLocation=new URL(String(linkCallback.headers.get('location')));assert.equal(linkLocation.origin,config.authPublicOrigin);assert.equal(linkLocation.pathname,'/projects');assert.equal(linkLocation.search,'');assert.equal(linkLocation.hash,'');const linkCookie=sessionCookie(linkCallback);const linkCsrf=csrfToken(linkCallback);const linkContext=await fetch(`${running.baseUrl}/api/core/auth/context`,{headers:browser(linkCookie)});assert.equal(linkContext.status,200);const linkBody=await linkContext.json() as any;assert.equal(linkBody.id,pending.user_id);assert.equal(csrfToken(linkContext),linkCsrf);
  const replayTokenCalls=tokenExchanges;const linkReplay=await callback(running,linkFlow,'link-local',signGoogle(claims(linkFlow.nonce,{sub:'linked-google-sub',email})));assert.equal(linkReplay.status,401);assert.equal(tokenExchanges,replayTokenCalls,'consumed OAuth state must fail before a second Google token exchange');

  const pendingGoogleEmail='pendinggoogle@gmail.com',pendingGooglePassword='untrusted pending password';const pendingGoogle=await register(running,pendingGoogleEmail,pendingGooglePassword);assert.ok(pendingGoogle.verification_handle);const pendingGoogleUser=(await pool.query('SELECT user_id FROM canonical_auth_users WHERE email_normalized=$1',[pendingGoogleEmail])).rows[0];
  const pendingGoogleFlow=await startGoogle(running);const pendingGoogleCallback=await callback(running,pendingGoogleFlow,'pending-google',signGoogle(claims(pendingGoogleFlow.nonce,{sub:'pending-google-sub',email:pendingGoogleEmail})));assert.equal(pendingGoogleCallback.status,302);assert.ok(sessionCookie(pendingGoogleCallback));assert.ok(csrfToken(pendingGoogleCallback));assert.equal(new URL(String(pendingGoogleCallback.headers.get('location'))).hash,'');assert.equal((await post(running.baseUrl,'/api/core/auth/password/login',{email:pendingGoogleEmail,password:pendingGooglePassword})).status,401);assert.equal(Number((await pool.query('SELECT count(*)::int AS count FROM canonical_auth_password_credentials WHERE user_id=$1',[pendingGoogleUser.user_id])).rows[0].count),0);

  await running.production.auth.store.provisionLocalUser({tenantId:config.authDefaultTenantId,userId:'custom-local',email:'person@corp.example',password:'custom local secure password'});const unsafeFlow=await startGoogle(running);const unsafe=await callback(running,unsafeFlow,'unsafe-link',signGoogle(claims(unsafeFlow.nonce,{sub:'unsafe-google-sub',email:'person@corp.example',hd:undefined})));assert.equal(unsafe.status,409);assert.equal((await unsafe.json() as any).code,'oauth_account_link_required');assert.equal(unsafe.headers.get('set-cookie'),null);

  const externalFlow=await startGoogle(running);const externalCallback=await callback(running,externalFlow,'external-google',signGoogle(claims(externalFlow.nonce,{sub:'external-google-sub',email:'external@example.org',hd:undefined})));assert.equal(externalCallback.status,302);const externalCookie=sessionCookie(externalCallback);assert.ok(csrfToken(externalCallback));assert.equal(new URL(String(externalCallback.headers.get('location'))).hash,'');const externalContext=await fetch(`${running.baseUrl}/api/core/auth/context`,{headers:browser(externalCookie)});assert.equal(externalContext.status,200);const externalBody=await externalContext.json() as any;assert.equal(externalBody.email_verified,false);const mailsBeforeExternalReset=mails.length;assert.equal((await post(running.baseUrl,'/api/core/auth/password/reset-request',{email:'external@example.org'})).status,202);assert.equal(mails.length,mailsBeforeExternalReset);

  const googleFlow=await startGoogle(running,'/projects');const googleCallback=await callback(running,googleFlow,'good-google',signGoogle(claims(googleFlow.nonce,{sub:'new-google-sub',email:'newoauth@gmail.com'})));assert.equal(googleCallback.status,302);const googleLocation=new URL(String(googleCallback.headers.get('location')));assert.equal(googleLocation.pathname,'/projects');assert.equal(googleLocation.search,'');assert.equal(googleLocation.hash,'');const googleCookie=sessionCookie(googleCallback);const googleCsrf=csrfToken(googleCallback);const googleContext=await fetch(`${running.baseUrl}/api/core/auth/context`,{headers:browser(googleCookie)});assert.equal(googleContext.status,200);const googleBody=await googleContext.json() as any;assert.equal('access_token' in googleBody,false);assert.equal(googleBody.email,'newoauth@gmail.com');assert.equal(csrfToken(googleContext),googleCsrf);assert.equal((await createProject(running,googleCookie,googleCsrf,'Google Auth Project')).status,201);assert.equal((await fetch(`${running.baseUrl}/api/core/projects`,{headers:browser(googleCookie)})).status,200);assert.equal((await pool.query("SELECT count(*)::int AS count FROM canonical_auth_oauth_identities WHERE provider='google' AND provider_subject='new-google-sub'")).rows[0].count,1);
  assert.equal(Number((await pool.query('SELECT count(*)::int AS count FROM canonical_auth_browser_grants')).rows[0].count),0,'server-side OAuth callbacks must create no JS-visible browser grants');

  await stop(running);running=await start();const afterRestart=await fetch(`${running.baseUrl}/api/core/auth/context`,{headers:browser(googleCookie)});assert.equal(afterRestart.status,200);assert.equal(csrfToken(afterRestart),googleCsrf);assert.equal((await post(running.baseUrl,'/api/core/auth/password/reset',{resetToken:reset,newPassword:'yet another secure password'})).status,400);
  for(const secret of [config.resendApiKey,config.googleOauthClientSecret,config.authChallengeSecret,ownerCode1,reset]) assert.equal(JSON.stringify([existingResetBody,verifiedBody,googleBody]).includes(secret),false);
  assert.equal(providerCalls,0);assert.equal(Number((await pool.query('SELECT count(*)::int AS count FROM credit_reservations')).rows[0].count),0);
});
