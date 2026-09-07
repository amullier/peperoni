<script>
  import { store } from './store.svelte.js'
  import { formatFR, fromISO, compareISO } from './dates.js'

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

  // Tâches issues des plantations saisies : semis en godet (si le légume
  // s'élève en pépinière) puis plantation, à leurs dates respectives.
  let tasks = $derived.by(() => {
    const list = []
    for (const planting of store.plantings) {
      const crop = store.getCrop(planting.cropId)
      if (!crop) continue
      const base = {
        planting,
        crop,
        zone: zoneName(planting.zoneId),
        sheltered: store.isPlantingSheltered(planting),
        variety: planting.variety ?? null,
      }
      const sowingDate = store.plantingSowingDate(planting)
      if (sowingDate) {
        list.push({ ...base, type: 'semis', date: sowingDate })
        list.push({ ...base, type: 'plantation', date: planting.plantedDate })
      } else {
        list.push({ ...base, type: 'semis-direct', date: planting.plantedDate })
      }
    }
    return list.sort(
      (a, b) => compareISO(a.date, b.date) || a.crop.name.localeCompare(b.crop.name)
    )
  })

  // Regroupement par mois (année-mois), dans l'ordre chronologique
  let groups = $derived.by(() => {
    const byMonth = new Map()
    for (const task of tasks) {
      const d = fromISO(task.date)
      const key = `${d.getFullYear()}-${d.getMonth()}`
      if (!byMonth.has(key)) {
        byMonth.set(key, {
          key,
          label: `${MONTHS[d.getMonth()]} ${d.getFullYear()}`,
          tasks: [],
        })
      }
      byMonth.get(key).tasks.push(task)
    }
    return [...byMonth.values()]
  })

  function taskKey(task) {
    return `${task.planting.id}:${task.type}`
  }

  function isDone(task) {
    return store.isTaskDone(taskKey(task), task.date)
  }

  const TYPE_LABELS = {
    semis: { icon: '🌱', label: 'Semis en godet' },
    'semis-direct': { icon: '🌱', label: 'Semis direct' },
    plantation: { icon: '🪴', label: 'Plantation' },
  }

  const DAY_MONTH = { day: 'numeric', month: 'short' }
  function formatDay(iso) {
    return fromISO(iso).toLocaleDateString('fr-FR', DAY_MONTH)
  }
</script>

<div class="calendar">
  <div class="head">
    <h2>🗓️ Calendrier des tâches</h2>
    <p class="hint">
      Semis et plantations d'après les légumes saisis sur la planification.
      Cochez les tâches faites ; les tâches antérieures au
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
        <ul>
          {#each group.tasks as task (taskKey(task))}
            <li class:done={isDone(task)}>
              <button
                class="check"
                title={isDone(task) ? 'Marquer à faire' : 'Marquer comme fait'}
                onclick={() => store.toggleTaskDone(taskKey(task), task.date)}
              >
                {isDone(task) ? '✅' : '⬜'}
              </button>
              <span class="date">{formatDay(task.date)}</span>
              <span class="icon">{TYPE_LABELS[task.type].icon}</span>
              <span class="text">
                {TYPE_LABELS[task.type].label} de
                <strong>{task.crop.emoji} {task.crop.name}</strong>
                {#if task.variety}
                  <span class="variety">« {task.variety} »</span>
                {/if}
                — {task.zone}
              </span>
              {#if task.sheltered && task.type !== 'semis'}
                <span class="badge">sous abri</span>
              {/if}
            </li>
          {/each}
        </ul>
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
