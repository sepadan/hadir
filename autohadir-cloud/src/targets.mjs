import { AppError } from './errors.mjs';

// Satu-satunya URL yang boleh dinavigasi oleh pelayar awan.
export const TARGET_ENUMS = Object.freeze({
  control: 'https://example.com',
  idme: 'https://idme.moe.gov.my/login',
  moeis: 'https://moeispel.moe.gov.my/sahsiah/kehadiran/pkhem/tabguru'
});

export const TARGET_URLS = Object.freeze(new Set(Object.values(TARGET_ENUMS)));

export function resolveTarget(key) {
  if (typeof key !== 'string' || !Object.hasOwn(TARGET_ENUMS, key)) throw new AppError('invalid-target');
  return TARGET_ENUMS[key];
}
