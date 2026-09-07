<script>
  import { store } from './store.svelte.js'
  import { formatFR, fromISO, toISO, addDays } from './dates.js'

  const MONTHS = [
    'Janvier',
    'Février',
    'Mars',
    'Avril',
    'Mai',
    'Juin',
    'Juillet',
    'Août',
    'Septembre',
    'Octobre',
    'Novembre',
    'Décembre',
  ]

  function zoneName(zoneId) {
    return store.zones.find((z) => z.id === zoneId)?.name ?? 'Zone supprimée'
  }

  // Tâches élémentaires issues des plantations saisies : semis en godet
  // (si le légume s'élève en pépinière), plantation, puis début de récolte.
  let rawTasks = $derived.by(() => {
    const list = []
    for (const planting of store.plantings) {
      const crop = store.getCrop(planting.cropId)
      if (!crop) continue
      const plants = store.estimatePlantCount(planting)
      const sowingDate = store.plantingSowingDate(planting)
      if (sowingDate) {
        list.push({ crop, plants, type: 'semis', date: sowingDate })
        list.push({ crop, plants, type: 'plantation', date: planting.plantedDate })
      } else {
        list.push({ crop, plants, type: 'semis-direct', date: planting.plantedDate })
      }
      // Début de récolte : par parcelle (la zone importe pour aller récolter)
      list.push({
        crop,
        plants,
        type: 'recolte',
        date: store.plantingHarvestStart(planting),
        zone: zoneName(planting.zoneId),
      })
    }
    return list
  })

  // Numéro de bloc de 3 jours (jours civils depuis l'epoch / 3)
  function blockIndex(iso) {
    const d = fromISO(iso)
    return Math.floor(
      Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000 / 3
    )
  }

  function blockStartISO(index) {
    const d = new Date(index * 3 * 86400000)
    return toISO(
      new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
    )
  }

  // Regroupement en blocs de 3 jours, puis par légume + type de tâche
  // (toutes zones confondues, sauf les récoltes : une ligne par parcelle),
  // avec le total de plants estimés.
  const TYPE_ORDER = { semis: 0, 'semis-direct': 0, plantation: 1, recolte: 2 }

  let blocks = $derived.by(() => {
    const byBlock = new Map()
    for (const task of rawTasks) {
      const idx = blockIndex(task.date)
      if (!byBlock.has(idx)) byBlock.set(idx, new Map())
      const byCrop = byBlock.get(idx)
      const key = `${task.type}:${task.crop.id}${task.zone ? `:${task.zone}` : ''}`
      if (!byCrop.has(key)) {
        byCrop.set(key, {
          key,
          type: task.type,
          crop: task.crop,
          zone: task.zone ?? null,
          plants: 0,
        })
      }
      byCrop.get(key).plants += task.plants
    }
    return [...byBlock.entries()]
      .sort(([a], [b]) => a - b)
      .map(([idx, byCrop]) => {
        const start = blockStartISO(idx)
        const end = addDays(start, 2)
        return {
          idx,
          start,
          end,
          tasks: [...byCrop.values()].sort(
            (a, b) =>
              TYPE_ORDER[a.type] - TYPE_ORDER[b.type] ||
              a.crop.name.localeCompare(b.crop.name) ||
              (a.zone ?? '').localeCompare(b.zone ?? '')
          ),
        }
      })
  })

  // Blocs regroupés par mois (année-mois) pour l'affichage en colonnes
  let groups = $derived.by(() => {
    const byMonth = new Map()
    for (const block of blocks) {
      const d = fromISO(block.start)
      const key = `${d.getFullYear()}-${d.getMonth()}`
      if (!byMonth.has(key)) {
        byMonth.set(key, {
          key,
          label: `${MONTHS[d.getMonth()]} ${d.getFullYear()}`,
          blocks: [],
        })
      }
      byMonth.get(key).blocks.push(block)
    }
    return [...byMonth.values()]
  })

  function taskKey(block, task) {
    return `${block.idx}:${task.key}`
  }

  function isDone(block, task) {
    return store.isTaskDone(taskKey(block, task), block.end)
  }

  const TYPE_LABELS = {
    semis: { icon: '🌱', label: 'Semis en godet' },
    'semis-direct': { icon: '🌱', label: 'Semis direct' },
    plantation: { icon: '🪴', label: 'Plantation' },
    recolte: { icon: '🧺', label: 'Début de récolte' },
  }

  const DAY_MONTH = { day: 'numeric', month: 'short' }
  function formatDay(iso) {
    return fromISO(iso).toLocaleDateString('fr-FR', DAY_MONTH)
  }

  function blockLabel(block) {
    return `${formatDay(block.start)} – ${formatDay(block.end)}`
  }
</script>

<div class="calendar">
  <div class="head">
    <h2>🗓️ Calendrier des tâches</h2>
    <p class="hint">
      Semis et plantations regroupés par périodes de 3 jours, toutes zones
      confondues. Cochez les tâches faites ; les tâches antérieures au
      {formatFR(store.currentDate)} sont cochées par défaut.
    </p>
  </div>

  {#if groups.length === 0}
    <p class="empty">
      Aucune tâche : plantez des légumes sur l'écran Planification pour
      alimenter le calendrier.
    </p>
  {/if}

  <div class="months">
    {#each groups as group (group.key)}
      <section class="month">
        <h3>{group.label}</h3>
        {#each group.blocks as block (block.idx)}
          <div class="block">
            <h4>{blockLabel(block)}</h4>
            <ul>
              {#each block.tasks as task (task.key)}
                <li class:done={isDone(block, task)}>
                  <button
                    class="check"
                    title={isDone(block, task)
                      ? 'Marquer à faire'
                      : 'Marquer comme fait'}
                    onclick={() =>
                      store.toggleTaskDone(taskKey(block, task), block.end)}
                  >
                    {isDone(block, task) ? '✅' : '⬜'}
                  </button>
                  <span class="icon">{TYPE_LABELS[task.type].icon}</span>
                  <span class="text">
                    {TYPE_LABELS[task.type].label} de
                    <strong>{task.crop.emoji} {task.crop.name}</strong>
                    {#if task.zone}
                      <span class="zone">— {task.zone}</span>
                    {/if}
                  </span>
                  {#if task.type !== 'recolte'}
                    <span class="plants">≈ {task.plants} plants</span>
                  {/if}
                </li>
              {/each}
            </ul>
          </div>
        {/each}
      </section>
    {/each}
  </div>
</div>

<style>
  .calendar {
    height: 100%;
    overflow-y: auto;
    padding: 1rem 1.2rem 2rem;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
  }
  .head h2 {
    margin: 0 0 0.2rem;
    font-size: 1.15rem;
  }
  .hint {
    margin: 0 0 1rem;
    font-size: 0.85rem;
    color: #666;
  }
  /* Mois côte à côte : une colonne par mois, défilement horizontal */
  .months {
    display: flex;
    gap: 1rem;
    overflow-x: auto;
    align-items: flex-start;
    flex: 1;
    padding-bottom: 0.5rem;
  }
  .month {
    flex: 0 0 340px;
    background: #fff;
    border: 1px solid #ddd;
    border-radius: 10px;
    padding: 0.6rem 0.8rem;
  }
  .month h3 {
    font-size: 0.95rem;
    margin: 0 0 0.3rem;
    color: #3d6830;
    border-bottom: 1px solid #dbe7d2;
    padding-bottom: 0.2rem;
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  li {
    display: flex;
    align-items: baseline;
    gap: 0.4rem;
    padding: 0.3rem 0.2rem;
    font-size: 0.86rem;
    border-bottom: 1px dashed #eee;
    flex-wrap: wrap;
  }
  li:last-child {
    border-bottom: none;
  }
  li.done {
    opacity: 0.55;
  }
  li.done .text {
    text-decoration: line-through;
  }
  .check {
    font-size: 0.85rem;
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
    line-height: 1;
  }
  .check:hover {
    transform: scale(1.15);
  }
  .date {
    color: #888;
    font-size: 0.78rem;
    min-width: 3.6rem;
  }
  .block {
    margin-bottom: 0.5rem;
  }
  .block h4 {
    margin: 0.4rem 0 0.1rem;
    font-size: 0.78rem;
    color: #888;
    font-weight: 600;
  }
  .plants {
    margin-left: auto;
    color: #7a5c1e;
    font-size: 0.76rem;
    white-space: nowrap;
  }
  .zone {
    color: #777;
    font-size: 0.78rem;
  }
  .variety {
    color: #777;
    font-style: italic;
  }
  .badge {
    font-size: 0.68rem;
    background: #e8f1e2;
    color: #3d6830;
    border: 1px solid #b9d3a8;
    padding: 0.05rem 0.4rem;
    border-radius: 999px;
  }
  .empty {
    font-style: italic;
    color: #999;
  }
</style>
