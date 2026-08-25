// Service de dialogues « maison » remplaçant alert() / confirm() du
// navigateur. Utilisation :
//   await showAlert('Message…')
//   const ok = await showConfirm('Sûr ?', { danger: true })
// Le composant Dialog.svelte (monté dans App.svelte) affiche la boîte.

export const dialog = $state({ current: null })

export function showAlert(message, options = {}) {
  return new Promise((resolve) => {
    dialog.current = {
      type: 'alert',
      message,
      title: options.title ?? null,
      okLabel: options.okLabel ?? 'OK',
      resolve,
    }
  })
}

export function showConfirm(message, options = {}) {
  return new Promise((resolve) => {
    dialog.current = {
      type: 'confirm',
      message,
      title: options.title ?? null,
      okLabel: options.okLabel ?? 'Confirmer',
      cancelLabel: options.cancelLabel ?? 'Annuler',
      danger: options.danger ?? false,
      resolve,
    }
  })
}

// Ferme la boîte en résolvant la promesse (true = confirmé)
export function closeDialog(result) {
  const d = dialog.current
  dialog.current = null
  d?.resolve(d.type === 'alert' ? undefined : result)
}
