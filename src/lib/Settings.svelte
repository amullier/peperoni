<script>
  import { store } from './store.svelte.js'
  import { CROPS, CATEGORIES } from './crops.js'

  const cropGroups = Object.entries(CATEGORIES).map(([key, label]) => ({
    key,
    label,
    crops: Object.values(CROPS).filter((c) => c.category === key),
  }))

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

  function resetCrop(crop) {
    if (confirm(`Rétablir les valeurs par défaut pour « ${crop.name} » ?`)) {
      store.resetCropOverrides(crop.id)
    }
  }

  function deleteAll() {
    if (
      !confirm(
        'Tout supprimer : zones, plantations, arbres, serres et paramétrages.\n' +
          'Pensez à exporter vos données avant si besoin. Continuer ?'
      )
    )
      return
    if (!confirm('Dernière confirmation : cette action est irréversible.'))
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
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/each}

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
    padding: 1rem;
    max-width: 900px;
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
    background: #fff;
    border: 1px solid #e2e2e2;
    border-radius: 8px;
  }
  th,
  td {
    padding: 0.4rem 0.5rem;
    text-align: center;
    border-bottom: 1px solid #eee;
    font-size: 0.85rem;
  }
  th {
    background: #f0f6e8;
    color: #2d4a22;
    font-size: 0.72rem;
    font-weight: 600;
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
