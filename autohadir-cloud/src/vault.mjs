import { AppError } from './errors.mjs';
import { validateOwnerKey } from './crypto.mjs';

export const ACCOUNT_FIELDS = Object.freeze(['identifier','password','phrase','consent','allowUnreadablePhrase']);
export function validateAccount(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(k=>!ACCOUNT_FIELDS.includes(k))) throw new AppError('invalid-request');
  for (const [key,max] of [['identifier',128],['password',512],['phrase',160]]) {
    if (typeof value[key] !== 'string' || !value[key].trim() || value[key].length>max || /[\u0000-\u001f\u007f]/.test(value[key])) throw new AppError('invalid-request');
  }
  if (value.consent !== true || typeof value.allowUnreadablePhrase !== 'boolean') throw new AppError('invalid-request');
  return {identifier:value.identifier.trim(),password:value.password,phrase:value.phrase.trim(),consent:true,allowUnreadablePhrase:value.allowUnreadablePhrase};
}
const enc = new TextEncoder();
const context = 'autohadir-cloud:v1:idme-vault:JBA5054';
const aad = enc.encode(context);
async function keyFor(ownerKey) {
  validateOwnerKey(ownerKey);
  const material = await crypto.subtle.importKey('raw',enc.encode(ownerKey),'HKDF',false,['deriveKey']);
  return crypto.subtle.deriveKey({name:'HKDF',hash:'SHA-256',salt:enc.encode('autohadir-cloud:v1'),info:aad},material,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
}
function b64(bytes) { return btoa(String.fromCharCode(...new Uint8Array(bytes))); }
function bytes(s) {
  if (typeof s !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(s) || s.length>8192) throw new Error();
  return Uint8Array.from(atob(s),c=>c.charCodeAt(0));
}
export async function sealAccount(ownerKey, value) {
  const account = validateAccount(value);
  try {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:aad},await keyFor(ownerKey),enc.encode(JSON.stringify(account)));
    return {version:1,iv:b64(iv),ciphertext:b64(ciphertext)};
  } catch { throw new AppError('vault-unavailable'); }
}
export async function openAccount(ownerKey, record) {
  try {
    if (!record || record.version!==1) throw new Error();
    const iv = bytes(record.iv);
    if (iv.length!==12) throw new Error();
    const plain = await crypto.subtle.decrypt({name:'AES-GCM',iv,additionalData:aad},await keyFor(ownerKey),bytes(record.ciphertext));
    return validateAccount(JSON.parse(new TextDecoder().decode(plain)));
  } catch { throw new AppError('vault-unavailable'); }
}
