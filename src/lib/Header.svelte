<script>
  import { store, validateData } from './store.svelte.js'

  let { screen = $bindable('terrain'), tutoHighlight = null } = $props()

  let fileInput

  function exportData() {
    const blob = new Blob([JSON.stringify(store.serialize(), null, 2)], {
      type: 'application/json',
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `peperoni-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  async function onFileSelected(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    let data
    try {
      data = JSON.parse(await file.text())
    } catch {
      alert('Fichier invalide : impossible de lire le JSON.')
      return
    }
    if (!validateData(data)) {
      alert("Fichier invalide : ce n'est pas une sauvegarde Peperoni.")
      return
    }
    if (store.hasData) {
      const ok = confirm(
        'Des données existent déjà. Les remplacer par celles du fichier importé ?'
      )
      if (!ok) return
    }
    store.importData(data)
  }
</script>

<header>
  <div class="brand">
    <span class="logo">🌶️</span>
    <h1>Peperoni</h1>
  </div>

  <nav>
    <button
      class:active={screen === 'terrain'}
      class:tuto={tutoHighlight === 'terrain'}
      onclick={() => (screen = 'terrain')}
    >
      🗺️ Terrain
    </button>
    <button
      class:active={screen === 'planning'}
      class:tuto={tutoHighlight === 'planning'}
      onclick={() => (screen = 'planning')}
    >
      📅 Planification
    </button>
    <button
      class:active={screen === 'table'}
      class:tuto={tutoHighlight === 'table'}
      onclick={() => (screen = 'table')}
    >
      📊 Tableau
    </button>
    <button
      class:active={screen === 'settings'}
      class:tuto={tutoHighlight === 'settings'}
      onclick={() => (screen = 'settings')}
    >
      ⚙️ Paramétrage
    </button>
  </nav>

  <div class="actions">
    <button onclick={() => fileInput.click()}>📥 Importer</button>
    <button onclick={exportData}>📤 Exporter</button>
    <input
      type="file"
      accept=".json,application/json"
      bind:this={fileInput}
      onchange={onFileSelected}
      hidden
    />
  </div>
</header>

<style>
  header {
    display: flex;
    align-items: center;
    gap: 2rem;
    padding: 0.55rem 1.2rem;
    background: linear-gradient(120deg, #1e3317 0%, #2d4a22 55%, #3d6830 100%);
    color: #fff;
    box-shadow: 0 2px 12px rgba(30, 51, 23, 0.25);
    position: relative;
    z-index: 10;
  }
  .brand {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  .logo {
    font-size: 1.6rem;
    filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.3));
  }
  h1 {
    font-size: 1.25rem;
    margin: 0;
    font-weight: 700;
    letter-spacing: 0.02em;
  }
  nav {
    display: flex;
    gap: 0.25rem;
    flex: 1;
    background: rgba(0, 0, 0, 0.22);
    padding: 0.25rem;
    border-radius: 999px;
    max-width: fit-content;
  }
  nav button {
    background: transparent;
    border: none;
    color: rgba(255, 255, 255, 0.85);
    padding: 0.4rem 1rem;
    border-radius: 999px;
    cursor: pointer;
    font-size: 0.92rem;
    font-weight: 500;
  }
  nav button:hover {
    background: rgba(255, 255, 255, 0.12);
    color: #fff;
  }
  nav button.active {
    background: #6da653;
    color: #fff;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25);
  }
  .actions {
    display: flex;
    gap: 0.5rem;
    margin-left: auto;
  }
  .actions button {
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.25);
    color: #fff;
    padding: 0.4rem 0.9rem;
    border-radius: 999px;
    cursor: pointer;
    font-size: 0.85rem;
  }
  .actions button:hover {
    background: rgba(255, 255, 255, 0.18);
    border-color: rgba(255, 255, 255, 0.45);
  }
  /* Surbrillance du bouton d'écran pendant le tutoriel : le bouton passe
     au-dessus du voile sombre (z-index > overlay) avec un halo pulsé */
  nav button.tuto {
    position: relative;
    z-index: 301;
    background: #6da653;
    color: #fff;
    animation: tuto-pulse 1.4s ease-in-out infinite;
  }
  @keyframes tuto-pulse {
    0%,
    100% {
      box-shadow: 0 0 0 3px rgba(255, 255, 255, 0.85),
        0 0 18px 6px rgba(109, 166, 83, 0.9);
    }
    50% {
      box-shadow: 0 0 0 6px rgba(255, 255, 255, 0.55),
        0 0 26px 10px rgba(109, 166, 83, 0.6);
    }
  }
</style>
