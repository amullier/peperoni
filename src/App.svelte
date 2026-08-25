<script>
  import Header from './lib/Header.svelte'
  import Terrain from './lib/Terrain.svelte'
  import Planning from './lib/Planning.svelte'
  import Settings from './lib/Settings.svelte'
  import TableView from './lib/TableView.svelte'
  import Tutorial from './lib/Tutorial.svelte'
  import Dialog from './lib/Dialog.svelte'

  let screen = $state('terrain')

  // Tutoriel de première utilisation : une fois par session
  const TUTO_KEY = 'peperoni-tuto-seen'
  let showTuto = $state(sessionStorage.getItem(TUTO_KEY) !== '1')
  let tutoScreen = $state(null) // écran de l'étape courante du tutoriel

  function closeTuto() {
    sessionStorage.setItem(TUTO_KEY, '1')
    showTuto = false
  }
</script>

<div class="app">
  <Header bind:screen tutoHighlight={showTuto ? tutoScreen : null} />
  <main>
    {#if screen === 'terrain'}
      <Terrain />
    {:else if screen === 'planning'}
      <Planning />
    {:else if screen === 'table'}
      <TableView />
    {:else}
      <Settings />
    {/if}
  </main>
</div>

{#if showTuto}
  <Tutorial
    onclose={closeTuto}
    ongoto={(s) => (screen = s)}
    onhighlight={(s) => (tutoScreen = s)}
  />
{/if}

<Dialog />

<style>
  .app {
    display: flex;
    flex-direction: column;
    height: 100vh;
    /* Hauteur réelle du viewport sur mobile (barres du navigateur) */
    height: 100dvh;
    overflow: hidden;
  }
  main {
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }
</style>
