/**
 * Popup provisoire (lot 1) : affiche l'état du coffre. L'interface complète
 * (onboarding, portefeuille) arrive aux lots 2 et 3.
 */
const status = document.querySelector<HTMLParagraphElement>('#status')!;
const lockBtn = document.querySelector<HTMLButtonElement>('#lock')!;

async function refresh() {
  const r = (await browser.runtime.sendMessage({ type: 'vault:status' })) as { ok: boolean; hasVault?: boolean; unlocked?: boolean };
  if (!r?.ok) {
    status.textContent = 'Indisponible';
    return;
  }
  status.textContent = !r.hasVault ? 'Aucun portefeuille' : r.unlocked ? 'Déverrouillé' : 'Verrouillé';
  lockBtn.hidden = !r.unlocked;
  if (r.unlocked) void browser.runtime.sendMessage({ type: 'vault:touch' });
}

lockBtn.addEventListener('click', async () => {
  await browser.runtime.sendMessage({ type: 'vault:lock' });
  await refresh();
});
void refresh();
