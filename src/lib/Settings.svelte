<script>
  import { store } from './store.svelte.js'
  import { CATEGORIES, windowsToMonths, monthsToWindows } from './crops.js'
  import { showConfirm } from './dialog.svelte.js'

  const MONTH_LABELS = [
    'janv',
    'févr',
    'mars',
    'avr',
    'mai',
    'juin',
    'juil',
    'août',
    'sept',
    'oct',
    'nov',
    'déc',
  ]

  let cropGroups = $derived(
    Object.entries(CATEGORIES).map(([key, label]) => ({
      key,
      label,
      crops: store.allCrops.filter((c) => c.category === key),
    }))
  )

  // --- Ajout d'un légume personnalisé ---
  let newName = $state('')
  let newEmoji = $state('🥦')
  let newCategory = $state('fruit')
  let emojiPickerOpen = $state(false)

  // Emojis proposés : uniquement des légumes/aliments unicode existants
  // et les pastilles de couleur (déjà utilisées par radis, betterave…)
  const EMOJI_CHOICES = [
    '🥦',
    '🥬',
    '🥗',
    '🍃',
    '🌿',
    '🌱',
    '🍅',
    '🥒',
    '🫑',
    '🌶️',
    '🍆',
    '🎃',
    '🫘',
    '🫛',
    '🍈',
    '🌽',
    '🥕',
    '🥔',
    '🍠',
    '🧅',
    '🧄',
    '🫚',
    '🍄',
    '🥜',
    '🫒',
    '🥑',
    '🔴',
    '🟠',
    '🟡',
    '🟢',
    '🔵',
    '🟣',
    '🟤',
    '⚫',
    '⚪',
  ]

  function addCrop() {
    const name = newName.trim()
    if (!name) return
    store.addCustomCrop({
      name,
      emoji: newEmoji,
      category: newCategory,
    })
    newName = ''
    newEmoji = '🥦'
    emojiPickerOpen = false
  }

  // --- Fenêtres de plantation des légumes personnalisés ---
  let editingWindowsCropId = $state(null)

  function toggleWindowsEditor(crop) {
    editingWindowsCropId = editingWindowsCropId === crop.id ? null : crop.id
  }

  // Ajoute/retire un mois d'une fenêtre de plantation d'un légume ajouté
  function toggleMonth(crop, field, month) {
    const months = windowsToMonths(crop[field])
    if (months.has(month)) months.delete(month)
    else months.add(month)
    store.updateCustomCrop(crop.id, { [field]: monthsToWindows(months) })
  }

  async function removeCustomCrop(crop) {
    const hasPlantings = store.plantings.some((p) => p.cropId === crop.id)
    const msg = hasPlantings
      ? `Supprimer « ${crop.name} » et ses plantations ?`
      : `Supprimer « ${crop.name} » ?`
    if (
      await showConfirm(msg, {
        title: 'Supprimer le légume',
        okLabel: 'Supprimer',
        danger: true,
      })
    )
      store.removeCustomCrop(crop.id)
  }

  const FIELDS = [
    { key: 'rowSpacingCm', label: 'Entre rangs (cm)', min: 1 },
    { key: 'plantSpacingCm', label: 'Entre plants (cm)', min: 1 },
    { key: 'harvestFromMonths', label: 'Récolte à partir de (mois)', min: 1 },
    { key: 'totalMonths', label: 'Culture totale (mois)', min: 1 },
    {
      key: 'shelterHarvestFromMonths',
      label: 'Récolte à partir de — sous abri (mois)',
      min: 1,
    },
    {
      key: 'shelterTotalMonths',
      label: 'Culture totale — sous abri (mois)',
      min: 1,
    },
  ]

  function onFieldChange(cropId, field, rawValue) {
    const value = Math.max(field.min, Math.round(Number(rawValue) || 0))
    if (!value) return
    store.setCropOverride(cropId, field.key, value)
  }

  // Semis en godet : 0 = semis direct, sinon jours entre semis et plantation
  const DEFAULT_NURSERY_DAYS = 42

  function toggleNursery(crop) {
    const metrics = store.cropMetrics(crop.id)
    store.setCropOverride(
      crop.id,
      'nurseryDays',
      metrics.nurseryDays > 0 ? 0 : (crop.nurseryDays ?? DEFAULT_NURSERY_DAYS)
    )
  }

  function onNurseryDaysChange(cropId, rawValue) {
    const value = Math.max(1, Math.round(Number(rawValue) || 0))
    if (!value) return
    store.setCropOverride(cropId, 'nurseryDays', value)
  }

  async function resetCrop(crop) {
    if (
      await showConfirm(
        `Rétablir les valeurs par défaut pour « ${crop.name} » ?`,
        { title: 'Rétablir', okLabel: 'Rétablir' }
      )
    ) {
      store.resetCropOverrides(crop.id)
    }
  }

  async function deleteAll() {
    if (
      !(await showConfirm(
        'Tout supprimer : zones, plantations, arbres, serres et paramétrages.\n' +
          'Pensez à exporter vos données avant si besoin. Continuer ?',
        { title: 'Tout supprimer', okLabel: 'Continuer', danger: true }
      ))
    )
      return
    if (
      !(await showConfirm(
        'Dernière confirmation : cette action est irréversible.',
        { title: 'Tout supprimer', okLabel: 'Tout supprimer', danger: true }
      ))
    )
      return
    store.clearAll()
  }
</script>

<div class="settings-screen">
  <h2>⚙️ Paramétrage des légumes</h2>
  <p class="hint">
    Ajustez les métriques de chaque légume : espacements de plantation par
    défaut, début de récolte et temps de culture total (au-delà, la culture
    disparaît du plan). Les colonnes « sous abri » s'appliquent aux zones
    couvertes par une serre. « Semis en godet » indique si le légume s'élève
    en pépinière avant plantation, et combien de jours avant. Les valeurs
    modifiées sont surlignées ; ↺ rétablit les valeurs d'origine. 👁/🚫
    affiche ou masque le légume dans l'écran de planification.
  </p>

  {#each cropGroups as group (group.key)}
    <h3>{group.label}</h3>
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th class="visible-col" title="Visible dans la planification">👁</th>
            <th class="crop-col">Légume</th>
            {#each FIELDS as field (field.key)}
              <th>{field.label}</th>
            {/each}
            <th>Semis en godet (jours avant plantation)</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {#each group.crops as crop (crop.id)}
            {@const metrics = store.cropMetrics(crop.id)}
            {@const overrides = store.cropOverrides[crop.id] ?? {}}
            {@const hidden = store.isCropHidden(crop.id)}
            <tr class:modified={store.hasCropOverrides(crop.id)} class:hidden>
              <td class="visible-col">
                <button
                  class="eye"
                  title={hidden
                    ? 'Afficher dans la planification'
                    : 'Masquer dans la planification'}
                  onclick={() => store.toggleCropHidden(crop.id)}
                >
                  {hidden ? '🚫' : '👁'}
                </button>
              </td>
              <td class="crop-col">{crop.emoji} {crop.name}</td>
              {#each FIELDS as field (field.key)}
                <td>
                  <input
                    type="number"
                    min={field.min}
                    step="1"
                    class:overridden={overrides[field.key] !== undefined}
                    value={metrics[field.key]}
                    onchange={(e) =>
                      onFieldChange(crop.id, field, e.target.value)}
                  />
                </td>
              {/each}
              <td class="nursery-col">
                <label class="nursery">
                  <input
                    type="checkbox"
                    checked={metrics.nurseryDays > 0}
                    onchange={() => toggleNursery(crop)}
                  />
                  {#if metrics.nurseryDays > 0}
                    <input
                      type="number"
                      min="1"
                      step="1"
                      class:overridden={overrides.nurseryDays !== undefined}
                      value={metrics.nurseryDays}
                      onchange={(e) =>
                        onNurseryDaysChange(crop.id, e.target.value)}
                    />
                    <span class="unit">j</span>
                  {:else}
                    <span class="direct">semis direct</span>
                  {/if}
                </label>
              </td>
              <td>
                {#if store.hasCropOverrides(crop.id)}
                  <button
                    class="reset"
                    title="Rétablir les valeurs par défaut"
                    onclick={() => resetCrop(crop)}
                  >
                    ↺
                  </button>
                {/if}
                {#if store.isCustomCrop(crop.id)}
                  <button
                    class="reset"
                    title="Dates de plantation possibles"
                    onclick={() => toggleWindowsEditor(crop)}
                  >
                    📅
                  </button>
                  <button
                    class="reset"
                    title="Supprimer ce légume"
                    onclick={() => removeCustomCrop(crop)}
                  >
                    🗑
                  </button>
                {/if}
              </td>
            </tr>
            {#if editingWindowsCropId === crop.id}
              <tr class="windows-row">
                <td colspan={FIELDS.length + 4}>
                  <div class="windows-editor">
                    {#each [['plantWindows', '🌱 Pleine terre'], ['shelterPlantWindows', '🏠 Sous abri']] as [field, label] (field)}
                      {@const months = windowsToMonths(crop[field])}
                      <div class="windows-line">
                        <span class="windows-label">{label}</span>
                        {#each MONTH_LABELS as m, i (m)}
                          <button
                            class="month-toggle"
                            class:on={months.has(i + 1)}
                            title={months.has(i + 1)
                              ? 'Retirer ce mois'
                              : 'Autoriser ce mois'}
                            onclick={() => toggleMonth(crop, field, i + 1)}
                          >
                            {m}
                          </button>
                        {/each}
                      </div>
                    {/each}
                  </div>
                </td>
              </tr>
            {/if}
          {/each}
        </tbody>
      </table>
    </div>
  {/each}

  <h3>Ajouter un légume</h3>
  <form class="add-crop" onsubmit={(e) => (e.preventDefault(), addCrop())}>
    <div class="emoji-picker">
      <button
        type="button"
        class="emoji-current"
        title="Choisir un emoji"
        onclick={() => (emojiPickerOpen = !emojiPickerOpen)}
      >
        {newEmoji} ▾
      </button>
      {#if emojiPickerOpen}
        <div class="emoji-grid">
          {#each EMOJI_CHOICES as emoji (emoji)}
            <button
              type="button"
              class:selected={emoji === newEmoji}
              onclick={() => {
                newEmoji = emoji
                emojiPickerOpen = false
              }}
            >
              {emoji}
            </button>
          {/each}
        </div>
      {/if}
    </div>
    <input
      type="text"
      class="name-input"
      placeholder="Nom du légume…"
      bind:value={newName}
      required
    />
    <select bind:value={newCategory}>
      {#each Object.entries(CATEGORIES) as [key, label] (key)}
        <option value={key}>{label}</option>
      {/each}
    </select>
    <button type="submit" disabled={!newName.trim()}>＋ Ajouter</button>
    <p class="add-hint">
      Le légume est créé avec des valeurs par défaut (plantable toute
      l'année) : ajustez ses métriques dans le tableau ci-dessus et ses
      dates de plantation possibles avec le bouton 📅.
    </p>
  </form>

  <h3>Zone dangereuse</h3>
  <div class="danger-zone">
    <p>
      Supprime définitivement toutes les données : zones, plantations,
      arbres, serres, métriques modifiées et légumes masqués.
    </p>
    <button class="danger" onclick={deleteAll}>🗑 Tout supprimer</button>
  </div>
</div>

<style>
  .settings-screen {
    padding: 1rem 1.5rem;
    max-width: 1500px;
    margin: 0 auto;
    overflow-y: auto;
    height: 100%;
  }
  h2 {
    margin: 0 0 0.4rem;
    font-size: 1.2rem;
  }
  .hint {
    font-size: 0.85rem;
    color: #666;
    margin: 0 0 1rem;
  }
  h3 {
    margin: 1.2rem 0 0.4rem;
    font-size: 0.85rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #6b7c5e;
  }
  .table-wrap {
    overflow-x: auto;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-m);
    overflow: hidden;
    box-shadow: var(--shadow-s);
  }
  th,
  td {
    padding: 0.4rem 0.5rem;
    text-align: center;
    border-bottom: 1px solid #eee;
    font-size: 0.85rem;
  }
  th {
    background: #eef4e6;
    color: var(--green-800);
    font-size: 0.72rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }
  tbody tr {
    transition: background 0.12s ease;
  }
  tbody tr:hover {
    background: var(--green-50);
  }
  .crop-col {
    text-align: left;
    white-space: nowrap;
  }
  tr.modified {
    background: #fffaea;
  }
  tr.hidden td {
    opacity: 0.45;
  }
  tr.hidden td.visible-col {
    opacity: 1;
  }
  .visible-col {
    width: 2.2rem;
  }
  button.eye {
    background: none;
    border: none;
    cursor: pointer;
    font-size: 0.95rem;
    padding: 0.1rem 0.2rem;
  }
  td input {
    width: 4.5rem;
    padding: 0.25rem 0.35rem;
    border: 1px solid #ccc;
    border-radius: 5px;
    font-size: 0.85rem;
    text-align: center;
  }
  td input.overridden {
    border-color: #d9a418;
    background: #fff6d9;
    font-weight: 600;
  }
  .nursery-col {
    white-space: nowrap;
  }
  .nursery {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    cursor: pointer;
  }
  .nursery input[type='number'] {
    width: 3.6rem;
  }
  .nursery .unit {
    font-size: 0.8rem;
    color: #666;
  }
  .nursery .direct {
    font-size: 0.75rem;
    color: #999;
    font-style: italic;
  }
  button.reset {
    background: none;
    border: 1px solid #ccc;
    border-radius: 5px;
    cursor: pointer;
    padding: 0.15rem 0.4rem;
    font-size: 0.9rem;
  }
  button.reset:hover {
    background: #f2f2f2;
  }
  tr.windows-row td {
    background: #f7faf3;
    text-align: left;
  }
  .windows-editor {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
    padding: 0.2rem 0;
  }
  .windows-line {
    display: flex;
    align-items: center;
    gap: 0.2rem;
    flex-wrap: wrap;
  }
  .windows-label {
    width: 8rem;
    font-size: 0.78rem;
    color: #556b47;
    font-weight: 600;
  }
  .month-toggle {
    padding: 0.15rem 0.4rem;
    border: 1px solid #ccc;
    background: #fff;
    color: #999;
    border-radius: 999px;
    cursor: pointer;
    font-size: 0.72rem;
  }
  .month-toggle:hover {
    border-color: #4a7c3a;
  }
  .month-toggle.on {
    background: #4a7c3a;
    border-color: #4a7c3a;
    color: #fff;
  }
  .add-crop {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
    background: var(--surface, #fff);
    border: 1px solid var(--border, #ddd);
    border-radius: 8px;
    padding: 0.7rem 0.9rem;
  }
  .add-crop input,
  .add-crop select {
    padding: 0.35rem 0.5rem;
    border: 1px solid #ccc;
    border-radius: 6px;
    font-size: 0.85rem;
  }
  .add-crop .emoji-picker {
    position: relative;
  }
  .add-crop .emoji-current {
    padding: 0.3rem 0.55rem;
    border: 1px solid #ccc;
    background: #fff;
    color: #444;
    border-radius: 6px;
    cursor: pointer;
    font-size: 1rem;
  }
  .add-crop .emoji-current:hover {
    background: #f2f2f2;
  }
  .add-crop .emoji-grid {
    position: absolute;
    top: calc(100% + 4px);
    left: 0;
    z-index: 20;
    display: grid;
    grid-template-columns: repeat(7, 2rem);
    gap: 2px;
    background: #fff;
    border: 1px solid #ccc;
    border-radius: 8px;
    padding: 0.35rem;
    box-shadow: 0 6px 20px rgba(0, 0, 0, 0.15);
  }
  .add-crop .emoji-grid button {
    padding: 0.15rem;
    border: 1px solid transparent;
    background: none;
    border-radius: 6px;
    cursor: pointer;
    font-size: 1.05rem;
    line-height: 1.5;
  }
  .add-crop .emoji-grid button:hover {
    background: #eef4e6;
  }
  .add-crop .emoji-grid button.selected {
    border-color: #4a7c3a;
    background: #e8f2df;
  }
  .add-crop .name-input {
    width: 14rem;
  }
  .add-crop button {
    padding: 0.4rem 0.8rem;
    border: 1px solid #4a7c3a;
    background: #4a7c3a;
    color: #fff;
    border-radius: 6px;
    cursor: pointer;
    font-size: 0.85rem;
  }
  .add-crop button:disabled {
    opacity: 0.5;
    cursor: default;
  }
  .add-crop button:not(:disabled):hover {
    background: #3d6830;
  }
  .add-crop .add-hint {
    flex-basis: 100%;
    margin: 0;
    font-size: 0.78rem;
    color: #888;
  }
  .danger-zone {
    border: 1px solid #e0b4b4;
    background: #fdf6f6;
    border-radius: 8px;
    padding: 0.8rem 1rem;
    margin-bottom: 2rem;
    display: flex;
    align-items: center;
    gap: 1rem;
    justify-content: space-between;
  }
  .danger-zone p {
    margin: 0;
    font-size: 0.82rem;
    color: #8a4a4a;
  }
  button.danger {
    background: #fff;
    border: 1px solid #c0392b;
    color: #c0392b;
    border-radius: 6px;
    padding: 0.4rem 0.8rem;
    cursor: pointer;
    font-size: 0.85rem;
    white-space: nowrap;
  }
  button.danger:hover {
    background: #c0392b;
    color: #fff;
  }
</style>
