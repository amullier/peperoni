<script>
  // Tutoriel de première utilisation : affiché une fois par session
  // (sessionStorage), navigable étape par étape.
  let { onclose, ongoto, onhighlight } = $props()

  const STEPS = [
    {
      icon: '🗺️',
      title: 'Étape 1 — Dessinez votre terrain',
      screen: 'terrain',
      lines: [
        'Tracez vos zones de culture à la souris, ajoutez serres et arbres.',
        'Ctrl+molette : zoom · clic droit : copier / renommer / supprimer.',
      ],
    },
    {
      icon: '🌱',
      title: 'Étape 2 — Planifiez vos plantations',
      screen: 'planning',
      lines: [
        'Choisissez une date, un légume (🌱 pleine terre, 🏠 sous abri), puis cliquez sur une zone.',
        'Plantation au rang ou plant par plant.',
      ],
    },
    {
      icon: '📊',
      title: 'Étape 3 — Anticipez plants et récoltes',
      screen: 'table',
      lines: [
        'Semis, croissance et récoltes de l\u2019année en un coup d\u2019œil.',
        'Nombre de plants estimé par légume et par zone.',
      ],
    },
    {
      icon: '⚙️',
      title: 'Étape 4 — Ajustez le paramétrage',
      screen: 'settings',
      lines: [
        'Adaptez espacements, temps de culture et semis en godet à votre jardin.',
      ],
    },
  ]

  let step = $state(0)
  let current = $derived(STEPS[step])

  // Signale l'écran de l'étape courante pour mettre en surbrillance
  // son bouton d'accès dans l'en-tête
  $effect(() => {
    onhighlight?.(current.screen)
  })

  function close() {
    onclose?.()
  }

  function finish() {
    ongoto?.('terrain')
    close()
  }
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && close()} />

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="tuto-overlay" onclick={close}>
  <div class="tuto" onclick={(e) => e.stopPropagation()}>
    <button class="close" title="Fermer le tutoriel" onclick={close}>✕</button>

    <div class="icon">{current.icon}</div>
    <h2>{current.title}</h2>
    {#each current.lines as line}
      <p>{line}</p>
    {/each}

    <div class="dots">
      {#each STEPS as s, i (s.title)}
        <button
          class="dot"
          class:active={i === step}
          title={s.title}
          onclick={() => (step = i)}
        ></button>
      {/each}
    </div>

    <div class="actions">
      <button class="secondary" onclick={close}>Passer le tutoriel</button>
      <span class="spacer"></span>
      {#if step > 0}
        <button class="secondary" onclick={() => (step -= 1)}>
          ‹ Précédent
        </button>
      {/if}
      {#if step < STEPS.length - 1}
        <button class="primary" onclick={() => (step += 1)}>Suivant ›</button>
      {:else}
        <button class="primary" onclick={finish}>🌶️ C'est parti !</button>
      {/if}
    </div>
  </div>
</div>

<style>
  .tuto-overlay {
    position: fixed;
    inset: 0;
    z-index: 300;
    background: rgba(20, 30, 15, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .tuto {
    position: relative;
    background: #fff;
    border-radius: 16px;
    padding: 1.6rem 1.8rem 1.2rem;
    width: min(560px, calc(100vw - 2rem));
    box-shadow: 0 16px 48px rgba(30, 51, 23, 0.3);
    animation: tuto-in 0.22s ease;
  }
  @keyframes tuto-in {
    from {
      opacity: 0;
      transform: translateY(12px) scale(0.97);
    }
    to {
      opacity: 1;
      transform: none;
    }
  }
  .close {
    position: absolute;
    top: 0.6rem;
    right: 0.7rem;
    background: none;
    border: none;
    cursor: pointer;
    font-size: 1rem;
    color: #888;
  }
  .close:hover {
    color: #333;
  }
  .icon {
    font-size: 2.4rem;
    text-align: center;
  }
  h2 {
    margin: 0.4rem 0 0.8rem;
    font-size: 1.15rem;
    text-align: center;
    color: #2d4a22;
  }
  p {
    margin: 0 0 0.6rem;
    font-size: 0.9rem;
    color: #444;
    line-height: 1.45;
  }
  .dots {
    display: flex;
    justify-content: center;
    gap: 0.45rem;
    margin: 0.9rem 0;
  }
  .dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    border: 1px solid #4a7c3a;
    background: #fff;
    cursor: pointer;
    padding: 0;
  }
  .dot.active {
    background: #4a7c3a;
  }
  .actions {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
  }
  .actions .spacer {
    flex: 1;
  }
  .actions button {
    padding: 0.4rem 0.8rem;
    border-radius: 6px;
    cursor: pointer;
    font-size: 0.85rem;
  }
  .actions .primary {
    background: #4a7c3a;
    border: 1px solid #4a7c3a;
    color: #fff;
  }
  .actions .primary:hover {
    background: #3d6830;
  }
  .actions .secondary {
    background: #fff;
    border: 1px solid #ccc;
    color: #444;
  }
  .actions .secondary:hover {
    background: #f2f2f2;
  }
</style>
