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
    padding: 0.6rem 1.2rem;
    background: #2d4a22;
    color: #fff;
  }
  .brand {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  .logo {
    font-size: 1.6rem;
  }
  h1 {
    font-size: 1.3rem;
    margin: 0;
  }
  nav {
    display: flex;
    gap: 0.5rem;
    flex: 1;
  }
  button {
    background: transparent;
    border: 1px solid rgba(255, 255, 255, 0.3);
    color: #fff;
    padding: 0.4rem 0.9rem;
    border-radius: 6px;
    cursor: pointer;
    font-size: 0.95rem;
  }
  button:hover {
    background: rgba(255, 255, 255, 0.15);
  }
  nav button.active {
    background: #6da653;
    border-color: #6da653;
  }
  /* Surbrillance du bouton d'écran pendant le tutoriel : le bouton passe
     au-dessus du voile sombre (z-index > overlay) avec un halo pulsé */
  nav button.tuto {
    position: relative;
    z-index: 301;
    background: #6da653;
    border-color: #fff;
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
  .actions {
    display: flex;
    gap: 0.5rem;
  }
</style>
