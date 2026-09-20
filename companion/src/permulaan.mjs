// Ikat pelayan dahulu; apa-apa automasi startup hanya boleh bermula daripada
// callback listen yang membuktikan bind 127.0.0.1 berjaya.
export function dengarSelepasBind({ pelayan, port, selepasBind, apabilaBind, apabilaRalat }) {
  let sudahBind = false;
  pelayan.on('error', (ralat) => {
    apabilaRalat(ralat, sudahBind ? 'runtime' : 'bind');
  });
  pelayan.listen(port, '127.0.0.1', () => {
    sudahBind = true;
    if (apabilaBind) apabilaBind();
    Promise.resolve()
      .then(() => selepasBind())
      .catch((ralat) => apabilaRalat(ralat, 'auto-mula'));
  });
}

