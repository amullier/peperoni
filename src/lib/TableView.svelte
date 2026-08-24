<script>
  import { store } from './store.svelte.js'
  import { CROPS } from './crops.js'
  import { formatFR, fromISO, toISO, todayISO } from './dates.js'

  const MONTHS = [
    'janv.',
    'févr.',
    'mars',
    'avr.',
    'mai',
    'juin',
    'juil.',
    'août',
    'sept.',
    'oct.',
    'nov.',
    'déc.',
  ]

  let year = $derived(fromISO(store.currentDate).getFullYear())
  let groupBy = $state('crop') // 'crop' | 'zone'

  // Position (en %) d'une date dans l'année affichée (peut sortir de [0,100])
  function pct(iso) {
    const d = fromISO(iso).getTime()
    const start = new Date(year, 0, 1).getTime()
    const end = new Date(year + 1, 0, 1).getTime()
    return ((d - start) / (end - start)) * 100
  }

  function clamp01(v) {
    return Math.max(0, Math.min(100, v))
  }

  // Enrichit une plantation (zone, dates clés) — null si hors année affichée
  function enrich(p) {
    const zone = store.zones.find((z) => z.id === p.zoneId)
    const r = {
      planting: p,
      zone,
      crop: CROPS[p.cropId],
      sowing: store.plantingSowingDate(p),
      start: p.plantedDate,
      harvest: store.plantingHarvestStart(p),
      end: store.plantingEnd(p),
    }
    return pct(r.sowing ?? r.start) < 100 && pct(r.end) > 0 ? r : null
  }

  function totalPlants(plantings) {
    return plantings.reduce(
      (sum, r) => sum + store.estimatePlantCount(r.planting),
      0
    )
  }

  // Groupes du tableau : { id, label, sheltered, plantings } — chaque
  // plantation porte son libellé de sous-ligne (zone ou légume)
  let rows = $derived.by(() => {
    const groups = []
    if (groupBy === 'crop') {
      for (const crop of Object.values(CROPS)) {
        const plantings = store.plantings
          .filter((p) => p.cropId === crop.id)
          .map(enrich)
          .filter(Boolean)
          .map((r) => ({
            ...r,
            rowLabel: r.zone?.name ?? 'Zone supprimée',
            rowSheltered: r.zone ? store.isZoneSheltered(r.zone) : false,
          }))
          .sort((a, b) => (a.start < b.start ? -1 : 1))
        if (plantings.length > 0) {
          groups.push({
            id: crop.id,
            label: `${crop.emoji} ${crop.name}`,
            sheltered: false,
            plantings,
          })
        }
      }
    } else {
      const zoneList = [...store.zones, null] // null = zones supprimées
      for (const zone of zoneList) {
        const plantings = store.plantings
          .filter((p) =>
            zone
              ? p.zoneId === zone.id
              : !store.zones.some((z) => z.id === p.zoneId)
          )
          .map(enrich)
          .filter(Boolean)
          .map((r) => ({
            ...r,
            rowLabel: `${r.crop?.emoji ?? ''} ${r.crop?.name ?? r.planting.cropId}`,
            rowSheltered: false,
          }))
          .sort((a, b) => (a.start < b.start ? -1 : 1))
        if (plantings.length > 0) {
          groups.push({
            id: zone?.id ?? '__deleted__',
            label: zone ? `🗺️ ${zone.name}` : '🗺️ Zone supprimée',
            sheltered: zone ? store.isZoneSheltered(zone) : false,
            plantings,
          })
        }
      }
    }
    return groups
  })

  let todayIso = todayISO()
  let todayPct = $derived(
    fromISO(todayIso).getFullYear() === year ? pct(todayIso) : null
  )
  let cursorPct = $derived(pct(store.currentDate))

  function shiftYear(delta) {
    const d = fromISO(store.currentDate)
    d.setFullYear(d.getFullYear() + delta)
    store.currentDate = toISO(d)
  }

  function onGridClick(event) {
    const rect = event.currentTarget.getBoundingClientRect()
    const frac = Math.max(
      0,
      Math.min(0.9999, (event.clientX - rect.left) / rect.width)
    )
    const start = new Date(year, 0, 1).getTime()
    const end = new Date(year + 1, 0, 1).getTime()
    store.currentDate = toISO(new Date(start + frac * (end - start)))
  }
</script>

<div class="table-screen">
  <div class="toolbar">
    <div class="group-toggle">
      <button
        class:active={groupBy === 'crop'}
        onclick={() => (groupBy = 'crop')}
      >
        🥬 Par légume
      </button>
      <button
        class:active={groupBy === 'zone'}
        onclick={() => (groupBy = 'zone')}
      >
        🗺️ Par zone
      </button>
    </div>
    <h2>📊 Planification — vue tableau</h2>
    <div class="year-nav">
      <button onclick={() => shiftYear(-1)}>‹</button>
      <span class="year">{year}</span>
      <button onclick={() => shiftYear(1)}>›</button>
    </div>
    <span class="date-label">{formatFR(store.currentDate)}</span>
  </div>

  {#if rows.length === 0}
    <p class="empty">
      Aucune plantation sur {year}. Ajoutez des cultures dans l'écran
      « Planification ».
    </p>
  {:else}
    <div class="gantt">
      <!-- En-tête : mois -->
      <div class="row header">
        <div class="label"></div>
        <div class="track months">
          {#each MONTHS as month (month)}
            <div class="month">{month}</div>
          {/each}
        </div>
      </div>

      {#each rows as group (group.id)}
        <div class="row crop-row">
          <div class="label crop-label">
            {group.label}
            {#if group.sheltered}
              <span class="shelter" title="Sous abri">🏠</span>
            {/if}
            <span class="count">≈ {totalPlants(group.plantings)} plants</span>
          </div>
          <div class="track"></div>
        </div>
        {#each group.plantings as r (r.planting.id)}
          <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
          <div class="row">
            <div class="label zone-label">
              {r.rowLabel}
              {#if r.rowSheltered}
                <span class="shelter" title="Sous abri">🏠</span>
              {/if}
              <span class="count">
                ≈ {store.estimatePlantCount(r.planting)}
              </span>
            </div>
            <div class="track" onclick={onGridClick}>
              {#each MONTHS as month (month)}
                <div class="grid-cell"></div>
              {/each}
              {#if r.sowing && pct(r.sowing) < 100 && pct(r.start) > 0}
                <!-- Semis en godet : pastille + pointillés jusqu'à l'implantation -->
                <div
                  class="sowing-line"
                  style="left: {clamp01(pct(r.sowing))}%; width: {clamp01(
                    pct(r.start)
                  ) - clamp01(pct(r.sowing))}%"
                  title="Semis en godet le {formatFR(
                    r.sowing
                  )} → implantation le {formatFR(r.start)}"
                ></div>
                {#if pct(r.sowing) >= 0}
                  <div class="sowing-dot" style="left: {pct(r.sowing)}%">
                    <span class="tip">
                      🌱 Semis en godet le {formatFR(r.sowing)}
                    </span>
                  </div>
                {/if}
              {/if}
              <div
                class="bar growth"
                style="left: {clamp01(pct(r.start))}%; width: {clamp01(
                  pct(r.harvest)
                ) - clamp01(pct(r.start))}%"
                title="🌱 Croissance : du {formatFR(r.start)} au {formatFR(
                  r.harvest
                )}"
              ></div>
              <div
                class="bar harvest"
                style="left: {clamp01(pct(r.harvest))}%; width: {clamp01(
                  pct(r.end)
                ) - clamp01(pct(r.harvest))}%"
                title="✅ Récolte : du {formatFR(r.harvest)} au {formatFR(
                  r.end
                )}"
              ></div>
              {#if todayPct !== null}
                <div class="marker today" style="left: {todayPct}%"></div>
              {/if}
              <div class="marker cursor" style="left: {cursorPct}%"></div>
            </div>
          </div>
        {/each}
      {/each}
    </div>

    <div class="legend">
      <span><span class="swatch sowing-s"></span> Semis en godet</span>
      <span><span class="swatch growth"></span> Croissance</span>
      <span><span class="swatch harvest"></span> Récolte possible</span>
      <span><span class="swatch today-s"></span> Aujourd'hui</span>
      <span><span class="swatch cursor-s"></span> Date sélectionnée</span>
    </div>
  {/if}
</div>

<style>
  .table-screen {
    height: 100%;
    padding: 1rem;
    overflow-y: auto;
    box-sizing: border-box;
    max-width: 1100px;
    margin: 0 auto;
  }
  .toolbar {
    display: flex;
    align-items: center;
    gap: 1rem;
    margin-bottom: 1rem;
  }
  .group-toggle {
    display: flex;
    border: 1px solid #4a7c3a;
    border-radius: 6px;
    overflow: hidden;
  }
  .group-toggle button {
    border: none;
    background: #fff;
    color: #2d4a22;
    padding: 0.25rem 0.7rem;
    cursor: pointer;
    font-size: 0.82rem;
  }
  .group-toggle button + button {
    border-left: 1px solid #4a7c3a;
  }
  .group-toggle button:hover {
    background: #e8f2df;
  }
  .group-toggle button.active {
    background: #4a7c3a;
    color: #fff;
  }
  h2 {
    margin: 0;
    font-size: 1.15rem;
    flex: 1;
  }
  .year-nav {
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }
  .year-nav button {
    border: 1px solid #4a7c3a;
    background: #fff;
    color: #2d4a22;
    border-radius: 6px;
    padding: 0.2rem 0.7rem;
    cursor: pointer;
    font-size: 1rem;
  }
  .year-nav button:hover {
    background: #e8f2df;
  }
  .year {
    font-weight: 700;
    color: #2d4a22;
  }
  .date-label {
    font-weight: 600;
    color: #2d4a22;
    font-size: 0.9rem;
  }
  .empty {
    font-style: italic;
    color: #999;
  }
  .gantt {
    border: 1px solid #dde8d0;
    border-radius: 8px;
    overflow: hidden;
    background: #fff;
  }
  .row {
    display: flex;
    border-bottom: 1px solid #eef2e8;
  }
  .row:last-child {
    border-bottom: none;
  }
  .label {
    width: 180px;
    flex-shrink: 0;
    padding: 0.3rem 0.6rem;
    font-size: 0.82rem;
    display: flex;
    align-items: center;
    gap: 0.3rem;
    border-right: 1px solid #dde8d0;
  }
  .crop-row {
    background: #f0f6e8;
  }
  .crop-label {
    font-weight: 700;
    color: #2d4a22;
  }
  .zone-label {
    padding-left: 1.4rem;
    color: #555;
  }
  .shelter {
    font-size: 0.75rem;
  }
  .count {
    margin-left: auto;
    font-size: 0.7rem;
    color: #888;
    font-weight: 400;
    white-space: nowrap;
  }
  .track {
    position: relative;
    flex: 1;
    display: flex;
    min-height: 28px;
    cursor: pointer;
  }
  .header .track {
    cursor: default;
  }
  .months .month,
  .grid-cell {
    flex: 1;
    border-right: 1px solid #eef2e8;
  }
  .months .month {
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.68rem;
    color: #6b7c5e;
    background: #f0f6e8;
  }
  .grid-cell:last-child,
  .months .month:last-child {
    border-right: none;
  }
  .bar {
    position: absolute;
    top: 6px;
    bottom: 6px;
    border-radius: 4px;
  }
  .bar.growth {
    background: #8fbf6f;
  }
  .bar.harvest {
    background: #e8b93c;
    border-radius: 0 4px 4px 0;
  }
  .sowing-line {
    position: absolute;
    top: 50%;
    height: 0;
    border-top: 2px dashed #8a6d3b;
    margin-top: -1px;
    pointer-events: auto;
  }
  .sowing-dot {
    position: absolute;
    top: 50%;
    width: 10px;
    height: 10px;
    margin: -5px 0 0 -5px;
    border-radius: 50%;
    background: #8a6d3b;
    border: 2px solid #fff;
    box-sizing: border-box;
    z-index: 1;
    cursor: help;
  }
  .sowing-dot:hover {
    box-shadow: 0 0 0 3px rgba(138, 109, 59, 0.35);
  }
  .sowing-dot .tip {
    display: none;
    position: absolute;
    bottom: 14px;
    left: 50%;
    transform: translateX(-50%);
    background: #3a2c1a;
    color: #fff;
    font-size: 0.72rem;
    padding: 0.25rem 0.5rem;
    border-radius: 5px;
    white-space: nowrap;
    z-index: 10;
    pointer-events: none;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25);
  }
  .sowing-dot .tip::after {
    content: '';
    position: absolute;
    top: 100%;
    left: 50%;
    margin-left: -4px;
    border: 4px solid transparent;
    border-top-color: #3a2c1a;
  }
  .sowing-dot:hover .tip {
    display: block;
  }
  .marker {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 2px;
    margin-left: -1px;
    pointer-events: none;
  }
  .marker.today {
    background: #e0508a;
  }
  .marker.cursor {
    background: #2d4a22;
  }
  .legend {
    display: flex;
    gap: 1.2rem;
    margin-top: 0.6rem;
    font-size: 0.78rem;
    color: #555;
    flex-wrap: wrap;
  }
  .legend > span {
    display: flex;
    align-items: center;
    gap: 0.35rem;
  }
  .swatch {
    display: inline-block;
    width: 14px;
    height: 10px;
    border-radius: 3px;
  }
  .swatch.growth {
    background: #8fbf6f;
  }
  .swatch.sowing-s {
    background: transparent;
    border-top: 2px dashed #8a6d3b;
    height: 0;
    border-radius: 0;
    position: relative;
    top: 4px;
  }
  .swatch.harvest {
    background: #e8b93c;
  }
  .swatch.today-s {
    background: #e0508a;
    width: 3px;
  }
  .swatch.cursor-s {
    background: #2d4a22;
    width: 3px;
  }
</style>
