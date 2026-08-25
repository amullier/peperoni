<script>
  // Boîte de dialogue « maison » (voir dialog.svelte.js pour l'API)
  import { dialog, closeDialog } from './dialog.svelte.js'

  let d = $derived(dialog.current)
  let lines = $derived(d ? String(d.message).split('\n') : [])

  function onKeydown(e) {
    if (!d) return
    if (e.key === 'Escape') closeDialog(false)
    if (e.key === 'Enter') closeDialog(true)
  }
</script>

<svelte:window onkeydown={onKeydown} />

{#if d}
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div class="dialog-overlay" onclick={() => closeDialog(false)}>
    <div
      class="dialog"
      role="alertdialog"
      aria-modal="true"
      tabindex="-1"
      onclick={(e) => e.stopPropagation()}
    >
      <div class="icon">{d.type === 'confirm' ? (d.danger ? '⚠️' : '❓') : 'ℹ️'}</div>
      {#if d.title}
        <h2>{d.title}</h2>
      {/if}
      {#each lines as line (line)}
        <p>{line}</p>
      {/each}
      <div class="actions">
        {#if d.type === 'confirm'}
          <button class="secondary" onclick={() => closeDialog(false)}>
            {d.cancelLabel}
          </button>
          <button
            class="primary"
            class:danger={d.danger}
            onclick={() => closeDialog(true)}
          >
            {d.okLabel}
          </button>
        {:else}
          <button class="primary" onclick={() => closeDialog(true)}>
            {d.okLabel}
          </button>
        {/if}
      </div>
    </div>
  </div>
{/if}

<style>
  .dialog-overlay {
    position: fixed;
    inset: 0;
    z-index: 400;
    background: rgba(20, 30, 15, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .dialog {
    background: #fff;
    border-radius: 16px;
    padding: 1.4rem 1.6rem 1.1rem;
    width: min(440px, calc(100vw - 2rem));
    box-shadow: 0 16px 48px rgba(30, 51, 23, 0.3);
    animation: dialog-in 0.18s ease;
    text-align: center;
  }
  @keyframes dialog-in {
    from {
      opacity: 0;
      transform: translateY(10px) scale(0.97);
    }
    to {
      opacity: 1;
      transform: none;
    }
  }
  .icon {
    font-size: 2rem;
    margin-bottom: 0.3rem;
  }
  h2 {
    margin: 0 0 0.6rem;
    font-size: 1.05rem;
    color: #2d4a22;
  }
  p {
    margin: 0 0 0.5rem;
    font-size: 0.9rem;
    color: #444;
    line-height: 1.45;
  }
  .actions {
    display: flex;
    justify-content: center;
    gap: 0.6rem;
    margin-top: 1rem;
  }
  .actions button {
    padding: 0.45rem 1.1rem;
    border-radius: 8px;
    cursor: pointer;
    font-size: 0.88rem;
  }
  .primary {
    background: #4a7c3a;
    border: 1px solid #4a7c3a;
    color: #fff;
  }
  .primary:hover {
    background: #3d6830;
  }
  .primary.danger {
    background: #c0392b;
    border-color: #c0392b;
  }
  .primary.danger:hover {
    background: #a93226;
  }
  .secondary {
    background: #fff;
    border: 1px solid #ccc;
    color: #444;
  }
  .secondary:hover {
    background: #f2f2f2;
  }
</style>
