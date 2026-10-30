// Ungkapan Runtime.evaluate TETAP. Ia hanya memulangkan boolean, satu kiraan
// dan location.href (yang dikelaskan dan dibuang di Worker). Tiada teks, tajuk,
// nilai input, kuki atau storan dibaca keluar.
export const SAFE_EVALUATE_SCRIPT = `(() => {
  const doc = document;
  const text = (doc.body ? doc.body.innerText || '' : '').toLowerCase();
  const idInput = doc.querySelector('input#username, input#identification, input[name="username"], input[name="identity"], input[name="no_kp"], input#no_kp, input[placeholder*="Pengenalan" i], input[placeholder*="IC" i]');
  const submitBtn = Array.from(doc.querySelectorAll('button, input[type="submit"], a.btn')).some((el) => {
    const t = (el.textContent || el.getAttribute('value') || '').trim().toLowerCase();
    return t.includes('daftar masuk') || t.includes('log masuk') || t.includes('seterusnya');
  });
  const isIdMeLoginForm = Boolean(idInput && (submitBtn || doc.querySelector('form')));
  const isIdMePasswordStep = Boolean(doc.querySelector('input[type="password"]'));
  const isBlocked = text.includes('access denied') || text.includes('forbidden') ||
    text.includes('the requested url was rejected') || text.includes('imperva') ||
    text.includes('incapsula') || text.includes('perkhidmatan tidak tersedia') || text.includes('sekatan atas faktor keselamatan');
  const hasCaptchaOrOtp = Boolean(
    doc.querySelector('.g-recaptcha, iframe[src*="recaptcha"], iframe[src*="turnstile"], #cf-turnstile, input#otp, input#tac') ||
    text.includes('sila masukkan kod otp') || text.includes('kod keselamatan')
  );
  let moeisAttendanceSelectorCount = 0;
  if (location.hostname === 'moeispel.moe.gov.my') {
    moeisAttendanceSelectorCount = doc.querySelectorAll('input.idpelajarthadir, #kehadiran input.case-hadir[data-idpelajar], select.selectsebab').length;
  }
  return { href: String(location.href), isIdMeLoginForm, isIdMePasswordStep, isBlocked, hasCaptchaOrOtp, moeisAttendanceSelectorCount };
})()`;
