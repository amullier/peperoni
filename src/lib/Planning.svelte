<script>
  import { store } from './store.svelte.js'
  import { CATEGORIES, monthInWindows } from './crops.js'
  import { getTree } from './trees.js'
  import { formatFR, todayISO, fromISO, toISO } from './dates.js'
  import { showAlert, showConfirm } from './dialog.svelte.js'

  // Un légume par id : catalogue + légumes personnalisés
  const getCrop = (id) => store.getCrop(id)

  const W = 1000
  const H = 600
  const UNITS_PER_M = 60

  let selectedCropId = $state(null)
  let cropConfig = $state(null) // { mode, rows, rowSpacingCm, plantSpacingCm }
  let configPopup = $state(null) // { cropId } popup de configuration
  let cfgMode = $state('rows') // 'rows' (au rang) | 'plants' (par plant)
  let cfgRows = $state(1)
  let cfgRowSpacing = $state(40)
  let cfgPlantSpacing = $state(20)

  // --- Vue : zoom (Ctrl + molette) et pan (clic milieu), comme sur le Terrain ---

  let svgEl
  let view = $state({ x: 0, y: 0, w: W, h: H })
  let panning = $state(null) // { startX, startY, viewX, viewY }
  let isZoomed = $derived(view.w < W || view.x !== 0 || view.y !== 0)

  function clampView(value, max) {
    return Math.max(0, Math.min(max, value))
  }

  function toSvgPoint(event) {
    const pt = new DOMPoint(event.clientX, event.clientY)
    const { x, y } = pt.matrixTransform(svgEl.getScreenCTM().inverse())
    return {
      x: Math.max(0, Math.min(W, x)),
      y: Math.max(0, Math.min(H, y)),
    }
  }

  function onWheel(event) {
    if (!event.ctrlKey) return
    event.preventDefault()
    const p = toSvgPoint(event)
    const factor = event.deltaY > 0 ? 1.2 : 1 / 1.2
    const newW = Math.max(W / 10, Math.min(W, view.w * factor))
    const newH = newW * (H / W)
    view.x = clampView(p.x - ((p.x - view.x) * newW) / view.w, W - newW)
    view.y = clampView(p.y - ((p.y - view.y) * newH) / view.h, H - newH)
    view.w = newW
    view.h = newH
  }

  function resetView() {
    view = { x: 0, y: 0, w: W, h: H }
  }

  $effect(() => {
    // Écouteur manuel : Svelte marque `onwheel` comme passif par défaut,
    // ce qui empêcherait preventDefault (zoom navigateur)
    svgEl.addEventListener('wheel', onWheel, { passive: false })
    return () => svgEl.removeEventListener('wheel', onWheel)
  })

  function onPointerDown(event) {
    if (event.button === 1) {
      // Clic milieu : déplacement de la vue (pan)
      event.preventDefault()
      panning = {
        startX: event.clientX,
        startY: event.clientY,
        viewX: view.x,
        viewY: view.y,
      }
      event.currentTarget.setPointerCapture(event.pointerId)
    }
  }

  function onPointerMove(event) {
    if (panning) {
      const scale = view.w / svgEl.clientWidth
      view.x = clampView(
        panning.viewX - (event.clientX - panning.startX) * scale,
        W - view.w
      )
      view.y = clampView(
        panning.viewY - (event.clientY - panning.startY) * scale,
        H - view.h
      )
    }
  }

  function onPointerUp() {
    panning = null
  }

  // Implantabilité d'un légume à la date courante :
  // 'outdoor' (pleine terre), 'shelter' (sous abri uniquement) ou null
  function plantability(crop) {
    const month = fromISO(store.currentDate).getMonth() + 1
    if (monthInWindows(month, crop.plantWindows)) return 'outdoor'
    if (monthInWindows(month, crop.shelterPlantWindows)) return 'shelter'
    return null
  }

  function windowsLabel(windows = []) {
    return windows
      .map(([from, to]) =>
        from === to ? MONTHS[from - 1] : `${MONTHS[from - 1]} – ${MONTHS[to - 1]}`
      )
      .join(', ')
  }

  // Cultures groupées par famille, les implantables à la date courante
  // en premier (pleine terre, puis sous abri, puis les autres)
  const RANK = { outdoor: 0, shelter: 1 }
  let cropGroups = $derived(
    Object.entries(CATEGORIES).map(([key, label]) => ({
      key,
      label,
      crops: store.allCrops
        .filter((c) => c.category === key && !store.isCropHidden(c.id))
        .map((c) => ({ ...c, plantable: plantability(c) }))
        .sort(
          (a, b) =>
            (RANK[a.plantable] ?? 2) - (RANK[b.plantable] ?? 2) ||
            a.name.localeCompare(b.name, 'fr')
        ),
    }))
  )

  function toggleCrop(id) {
    if (selectedCropId === id) {
      selectedCropId = null
      cropConfig = null
      return
    }
    // Ouvre la configuration avec les valeurs par défaut du légume
    const metrics = store.cropMetrics(id)
    cfgMode = 'rows'
    cfgRows = 1
    cfgRowSpacing = metrics.rowSpacingCm
    cfgPlantSpacing = metrics.plantSpacingCm
    configPopup = { cropId: id }
  }

  function confirmConfig() {
    if (configPopup) {
      selectedCropId = configPopup.cropId
      cropConfig =
        cfgMode === 'plants'
          ? { mode: 'plants' }
          : {
              mode: 'rows',
              rows: Math.max(1, Math.round(Number(cfgRows) || 1)),
              rowSpacingCm: Math.max(1, Math.round(Number(cfgRowSpacing) || 40)),
              plantSpacingCm: Math.max(
                1,
                Math.round(Number(cfgPlantSpacing) || 20)
              ),
            }
    }
    configPopup = null
  }

  function cancelSelection() {
    selectedCropId = null
    cropConfig = null
  }

  // Géométrie des rangs de toutes les plantations actives d'une zone.
  // Les rangs suivent le côté le plus long de la zone. Le premier rang
  // démarre en haut/à gauche (marge fixe) et les plantations suivantes
  // s'empilent après, séparées par leur espacement de rangs.
  function rowsLayout(zone, items) {
    const cmToUnits = UNITS_PER_M / 100
    const horizontal = zone.w >= zone.h
    const maxD = (horizontal ? zone.h : zone.w) - 8
    let offset = 8 // marge initiale
    const blocks = []
    for (const [index, item] of items.entries()) {
      const p = item.planting
      const rowGap = (p.rowSpacingCm ?? 40) * cmToUnits
      const plantGap = (p.plantSpacingCm ?? 20) * cmToUnits
      const rows = p.rows ?? 1
      const margin = Math.max(6, plantGap / 2)
      if (index > 0) offset += rowGap // séparateur entre plantations
      const segs = []
      for (let i = 0; i < rows; i++) {
        const d = offset + i * rowGap
        if (d > maxD) break
        if (horizontal) {
          const y = zone.y + d
          const x1 = zone.x + margin
          const x2 = zone.x + zone.w - margin
          const plants = []
          for (let px = x1; px <= x2 + 0.01; px += plantGap)
            plants.push({ x: px, y })
          segs.push({ x1, y1: y, x2, y2: y, plants })
        } else {
          const x = zone.x + d
          const y1 = zone.y + margin
          const y2 = zone.y + zone.h - margin
          const plants = []
          for (let py = y1; py <= y2 + 0.01; py += plantGap)
            plants.push({ x, y: py })
          segs.push({ x1: x, y1, x2: x, y2, plants })
        }
      }
      blocks.push({ item, segs })
      offset += (rows - 1) * rowGap
    }
    return blocks
  }

  // Plantations actives d'une zone, enrichies (culture, statut, dates)
  function zonePlantings(zone) {
    return store.activePlantingsForZone(zone.id).map((planting) => ({
      planting,
      crop: getCrop(planting.cropId),
      status: store.plantingStatus(planting),
      harvestStart: store.plantingHarvestStart(planting),
      end: store.plantingEnd(planting),
    }))
  }

  function onZoneClick(zone, event) {
    const items = zonePlantings(zone)
    if (selectedCropId && cropConfig?.mode === 'plants') {
      // Placement libre : chaque clic pose un plant à l'endroit cliqué
      // (la sélection reste active pour enchaîner les plants)
      const p = toSvgPoint(event)
      const x = Math.max(zone.x + 4, Math.min(zone.x + zone.w - 4, p.x))
      const y = Math.max(zone.y + 4, Math.min(zone.y + zone.h - 4, p.y))
      store.plantAt(zone.id, selectedCropId, x, y)
    } else if (selectedCropId) {
      // Plantation au rang : chaque clic ajoute la configuration de rangs
      // à la zone cliquée (la sélection reste active pour enchaîner) ;
      // Échap ou clic hors d'une zone pour terminer
      const enough = store.canPlant(zone, cropConfig ?? {})
      store.plant(zone.id, selectedCropId, cropConfig ?? {})
      if (!enough) {
        showAlert(
          `Il n'y a pas assez de place dans « ${zone.name} » ` +
            `pour ${cropConfig?.rows ?? 1} rang(s) supplémentaire(s).\n` +
            `Les rangs en trop ne seront pas affichés.`,
          { title: 'Pas assez de place' }
        )
      }
    } else if (items.length > 0) {
      // Ouvre/ferme le panneau de détail à droite
      detailZoneId = detailZoneId === zone.id ? null : zone.id
    } else {
      detailZoneId = null
    }
  }

  // --- Panneau de détail des plantations d'une zone ---

  let detailZoneId = $state(null)
  let editingPlantingId = $state(null) // plantation en cours d'édition dans le panneau
  let detailZone = $derived(store.zones.find((z) => z.id === detailZoneId))
  let detailItems = $derived(detailZone ? zonePlantings(detailZone) : [])

  function plantCount(zone, items, plantingId) {
    const item = items.find((i) => i.planting.id === plantingId)
    if (item?.planting.mode === 'plants')
      return item.planting.plants?.length ?? 0
    const block = rowsLayout(zone, rowItems(items)).find(
      (b) => b.item.planting.id === plantingId
    )
    return block
      ? block.segs.reduce((sum, s) => sum + s.plants.length, 0)
      : 0
  }

  // Plantations en rangs / en placement libre d'une liste enrichie
  function rowItems(items) {
    return items.filter((i) => i.planting.mode !== 'plants')
  }
  function freeItems(items) {
    return items.filter((i) => i.planting.mode === 'plants')
  }

  async function removePlanting(planting) {
    if (
      await showConfirm('Retirer cette plantation ?', {
        okLabel: 'Retirer',
        danger: true,
      })
    ) {
      store.removePlanting(planting.id)
    }
  }

  // Édite une plantation en vérifiant que la zone a assez de place ;
  // sinon la modification est annulée
  function editPlanting(planting, patch) {
    const before = {
      plantedDate: planting.plantedDate,
      rows: planting.rows,
      rowSpacingCm: planting.rowSpacingCm,
      plantSpacingCm: planting.plantSpacingCm,
    }
    store.updatePlanting(planting.id, patch)
    const zone = detailZone
    if (zone && store.zoneUsedUnits(zone) > store.zoneCapacityUnits(zone)) {
      store.updatePlanting(planting.id, before)
      showAlert('Pas assez de place dans la zone pour cette modification.', {
        title: 'Pas assez de place',
      })
    }
  }

  function editPlantingNumber(planting, field, rawValue) {
    const value = Math.max(1, Math.round(Number(rawValue) || 0))
    if (!value) return
    editPlanting(planting, { [field]: value })
  }

  // Espace restant d'une zone, en mètres (le long du petit côté)
  function freeMeters(zone) {
    return (
      Math.max(0, store.zoneCapacityUnits(zone) - store.zoneUsedUnits(zone)) /
      UNITS_PER_M
    )
  }

  // --- Timeline annuelle (janvier → décembre) ---

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

  let timelineYear = $derived(fromISO(store.currentDate).getFullYear())

  function daysInMonth(year, monthIndex) {
    return new Date(year, monthIndex + 1, 0).getDate()
  }

  // Position (en %) d'une date ISO sur la timeline (mois à largeur égale)
  function datePct(iso) {
    const d = fromISO(iso)
    return (
      ((d.getMonth() +
        (d.getDate() - 1) / daysInMonth(d.getFullYear(), d.getMonth())) /
        12) *
      100
    )
  }

  let selectedPct = $derived(datePct(store.currentDate))
  let todayIso = todayISO()
  let todayPct = $derived(
    fromISO(todayIso).getFullYear() === timelineYear ? datePct(todayIso) : null
  )

  function onTimelineClick(event) {
    const rect = event.currentTarget.getBoundingClientRect()
    const frac = Math.max(
      0,
      Math.min(0.9999, (event.clientX - rect.left) / rect.width)
    )
    const monthIndex = Math.floor(frac * 12)
    const within = frac * 12 - monthIndex
    const day =
      1 + Math.round(within * (daysInMonth(timelineYear, monthIndex) - 1))
    store.currentDate = toISO(new Date(timelineYear, monthIndex, day))
  }
</script>

<svelte:window
  onkeydown={(e) => e.key === 'Escape' && selectedCropId && cancelSelection()}
/>

<div class="planning-screen">
  <div class="timeline-wrap">
    <span class="timeline-year">{timelineYear}</span>
    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
    <div
      class="timeline"
      onclick={onTimelineClick}
      title="Cliquez pour vous déplacer dans le temps"
    >
      {#each MONTHS as month, i (month)}
        <div
          class="month"
          class:current-month={Math.floor((selectedPct / 100) * 12) === i}
        >
          {month}
        </div>
      {/each}
      {#if todayPct !== null}
        <div class="today-marker" style="left: {todayPct}%" title="Aujourd'hui">
        </div>
      {/if}
      <div class="cursor" style="left: {selectedPct}%"></div>
    </div>
  </div>

  <div class="timebar">
    <label>
      📅 Date :
      <input type="date" bind:value={store.currentDate} />
    </label>
    <button onclick={() => store.shiftDate(1)}>+1 mois</button>
    <button onclick={() => store.shiftDate(6)}>+6 mois</button>
    <button onclick={() => store.shiftDate(12)}>+1 an</button>
    <button class="today" onclick={() => (store.currentDate = todayISO())}>
      Aujourd'hui
    </button>
    <span class="date-label">{formatFR(store.currentDate)}</span>
  </div>

  <div class="main">
    <aside>
      <h2>Cultures</h2>
      {#each cropGroups as group (group.key)}
        <h3 class="crop-category">{group.label}</h3>
        <ul>
          {#each group.crops as crop (crop.id)}
            <li>
              <button
                class="crop"
                class:selected={selectedCropId === crop.id}
                class:plantable-now={crop.plantable === 'outdoor'}
                class:plantable-shelter={crop.plantable === 'shelter'}
                onclick={() => toggleCrop(crop.id)}
                title="Plantation : {windowsLabel(crop.plantWindows) ||
                  '—'}{crop.shelterPlantWindows?.length
                  ? ` • sous abri : ${windowsLabel(crop.shelterPlantWindows)}`
                  : ''}"
              >
                <span class="emoji">{crop.emoji}</span>
                <span class="crop-text">
                  <span class="name">{crop.name}</span>
                  <span class="window">
                    {windowsLabel(crop.plantWindows)}
                    · prêt en {store.cropMetrics(crop.id).harvestFromMonths} mois
                  </span>
                </span>
                {#if crop.plantable === 'outdoor'}
                  <span class="badge-plant">🌱</span>
                {:else if crop.plantable === 'shelter'}
                  <span class="badge-plant" title="Plantable sous abri">🏠</span>
                {/if}
              </button>
            </li>
          {/each}
        </ul>
      {/each}

      {#if selectedCropId}
        {#if cropConfig?.mode === 'plants'}
          <p class="invite">
            👉 Cliquez dans une zone pour placer chaque plant de
            {getCrop(selectedCropId).name.toLowerCase()}.
            <button class="finish" onclick={cancelSelection}>✓ Terminer</button>
          </p>
        {:else}
          <p class="invite">
            👉 Cliquez sur une zone pour y planter des
            {getCrop(selectedCropId).name.toLowerCase()}s
            ({cropConfig?.rows} rang{cropConfig?.rows > 1 ? 's' : ''},
            {cropConfig?.rowSpacingCm} cm entre rangs,
            {cropConfig?.plantSpacingCm} cm entre plants). Chaque clic ajoute
            une plantation ; Échap ou clic à côté pour terminer.
            <button class="finish" onclick={cancelSelection}>✓ Terminer</button>
          </p>
        {/if}
      {:else}
        <p class="hint">
          Sélectionnez une culture pour configurer ses rangs, puis cliquez sur
          une zone. Cliquez sur une zone occupée pour voir les détails ou
          retirer la plantation.
        </p>
      {/if}
    </aside>

    <div class="canvas-wrap">
      {#if store.zones.length === 0}
        <p class="empty">
          Aucune zone définie. Rendez-vous dans l'écran « Terrain » pour
          dessiner vos zones de culture.
        </p>
      {/if}
      {#if isZoomed}
        <button class="reset-view" onclick={resetView}>
          🔍 Vue d'ensemble
        </button>
      {/if}
      <svg
        bind:this={svgEl}
        viewBox="{view.x} {view.y} {view.w} {view.h}"
        class:planting-mode={selectedCropId}
        class:panning
        role="application"
        aria-label="Plan des cultures"
        onpointerdown={onPointerDown}
        onpointermove={onPointerMove}
        onpointerup={onPointerUp}
      >
        <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
        <rect
          x="0"
          y="0"
          width={W}
          height={H}
          class="ground"
          role="presentation"
          onclick={() => selectedCropId && cancelSelection()}
        />

        <!-- Serres (surbrillance sous les zones de culture) -->
        {#each store.serres as serre (serre.id)}
          <g class="serre">
            <rect
              x={serre.x}
              y={serre.y}
              width={serre.w}
              height={serre.h}
              rx="4"
            />
          </g>
        {/each}

        {#each store.zones as zone (zone.id)}
          {@const items = zonePlantings(zone)}
          {@const occupied = items.length > 0}
          {@const allReady = occupied && items.every((i) => i.status === 'ready')}
          <g
            class="zone"
            class:occupied
            class:ready={allReady}
            class:plantable={selectedCropId &&
              (cropConfig?.mode === 'plants' ||
                store.canPlant(zone, cropConfig ?? {}))}
            class:detail={detailZoneId === zone.id}
            onclick={(e) => onZoneClick(zone, e)}
            onkeydown={(e) => e.key === 'Enter' && onZoneClick(zone, e)}
            role="button"
            tabindex="0"
          >
            <rect x={zone.x} y={zone.y} width={zone.w} height={zone.h} rx="6" />
            <text
              class="zone-label"
              x={zone.x + 4}
              y={zone.y >= 18 ? zone.y - 6 : zone.y + zone.h + 16}
            >
              {zone.name}{store.isZoneSheltered(zone) ? ' • sous abri' : ''}
            </text>
            <!-- Rangs des plantations (empilés) -->
            {#each rowsLayout(zone, rowItems(items)) as block}
              <g class="rows" class:rows-ready={block.item.status === 'ready'}>
                {#each block.segs as seg}
                  <line class="row-line" x1={seg.x1} y1={seg.y1} x2={seg.x2} y2={seg.y2} />
                  {#each seg.plants as p}
                    <circle class="plant-dot" cx={p.x} cy={p.y} r="2.5" />
                  {/each}
                {/each}
              </g>
            {/each}
            <!-- Plants placés librement -->
            {#each freeItems(items) as item (item.planting.id)}
              <g class="rows" class:rows-ready={item.status === 'ready'}>
                {#each item.planting.plants ?? [] as p}
                  <circle class="plant-dot free-plant" cx={p.x} cy={p.y} r="3.5" />
                {/each}
              </g>
            {/each}
          </g>
        {/each}

        <!-- Arbres (éléments fixes, non interactifs ici) -->
        {#each store.trees as tree (tree.id)}
          <g class="tree">
            <circle
              cx={tree.x}
              cy={tree.y}
              r={(getTree(tree.type).canopyM * UNITS_PER_M) / 2}
            />
            <text x={tree.x} y={tree.y}>{getTree(tree.type).emoji}</text>
            <text
              class="tree-variety"
              x={tree.x}
              y={tree.y + (getTree(tree.type).canopyM * UNITS_PER_M) / 2 + 14}
            >
              {getTree(tree.type).name}{tree.variety
                ? ` (${tree.variety})`
                : ''}
            </text>
          </g>
        {/each}
      </svg>
      {#if selectedCropId}
        <div class="planting-banner" role="status">
          <span>
            🌱 Mode saisie : {getCrop(selectedCropId).name.toLowerCase()} —
            Échap ou
          </span>
          <button onclick={cancelSelection}>✓ Quitter la saisie</button>
        </div>
      {/if}
    </div>

    {#if detailZone && detailItems.length > 0}
      <aside class="detail-panel">
        <div class="detail-header">
          <h2>
            {detailZone.name}{store.isZoneSheltered(detailZone)
              ? ' (sous abri)'
              : ''}
          </h2>
          <button
            class="close"
            title="Fermer"
            onclick={() => (detailZoneId = null)}
          >
            ✕
          </button>
        </div>
        <p class="free-space">
          Espace libre : {freeMeters(detailZone).toLocaleString('fr-FR', {
            maximumFractionDigits: 1,
          })} m
        </p>

        {#each detailItems as item (item.planting.id)}
          <div class="planting-card">
            <h3>
              {item.crop.emoji} {item.crop.name}
              {#if item.planting.variety}
                <span class="variety-label">({item.planting.variety})</span>
              {/if}
              <span class="status">
                {item.status === 'ready' ? '✅' : '🌱'}
              </span>
            </h3>

            {#if editingPlantingId === item.planting.id}
              <dl>
                <dt>Variété</dt>
                <dd>
                  <input
                    type="text"
                    list="varieties-{item.crop.id}"
                    placeholder="— Sans variété —"
                    value={item.planting.variety ?? ''}
                    onchange={(e) =>
                      editPlanting(item.planting, {
                        variety: e.target.value.trim() || null,
                      })}
                  />
                  <datalist id="varieties-{item.crop.id}">
                    {#each item.crop.varieties ?? [] as v (v)}
                      <option value={v}></option>
                    {/each}
                  </datalist>
                </dd>

                <dt>Planté le</dt>
                <dd>
                  <input
                    type="date"
                    value={item.planting.plantedDate}
                    onchange={(e) =>
                      e.target.value &&
                      editPlanting(item.planting, {
                        plantedDate: e.target.value,
                      })}
                  />
                </dd>

                {#if item.planting.mode === 'plants'}
                  <dt>Plants placés</dt>
                  <dd>
                    {item.planting.plants?.length ?? 0}
                    <button
                      class="mini"
                      title="Retirer le dernier plant placé"
                      onclick={() => store.removeLastPlant(item.planting.id)}
                    >
                      − dernier plant
                    </button>
                  </dd>
                {:else}
                  <dt>Nombre de rangs</dt>
                  <dd>
                    <input
                      type="number"
                      min="1"
                      step="1"
                      value={item.planting.rows ?? 1}
                      onchange={(e) =>
                        editPlantingNumber(item.planting, 'rows', e.target.value)}
                    />
                  </dd>

                  <dt>Espacement entre rangs (cm)</dt>
                  <dd>
                    <input
                      type="number"
                      min="1"
                      step="1"
                      value={item.planting.rowSpacingCm ?? 40}
                      onchange={(e) =>
                        editPlantingNumber(
                          item.planting,
                          'rowSpacingCm',
                          e.target.value
                        )}
                    />
                  </dd>

                  <dt>Espacement entre plants (cm)</dt>
                  <dd>
                    <input
                      type="number"
                      min="1"
                      step="1"
                      value={item.planting.plantSpacingCm ?? 20}
                      onchange={(e) =>
                        editPlantingNumber(
                          item.planting,
                          'plantSpacingCm',
                          e.target.value
                        )}
                    />
                  </dd>
                {/if}
              </dl>
              <div class="card-actions">
                <button
                  class="secondary"
                  onclick={() => (editingPlantingId = null)}
                >
                  ✓ Terminer
                </button>
              </div>
            {:else}
              <dl>
                {#if store.plantingSowingDate(item.planting)}
                  <dt>Semis en godet</dt>
                  <dd>{formatFR(store.plantingSowingDate(item.planting))}</dd>
                {/if}

                <dt>Planté le</dt>
                <dd>{formatFR(item.planting.plantedDate)}</dd>

                <dt>Récolte</dt>
                <dd>
                  du {formatFR(item.harvestStart)}<br />
                  au {formatFR(item.end)}
                </dd>

                <dt>Plants (estimation)</dt>
                <dd>
                  ≈ {plantCount(detailZone, detailItems, item.planting.id)} plants
                </dd>
              </dl>
              <div class="card-actions">
                <button
                  class="secondary"
                  onclick={() => (editingPlantingId = item.planting.id)}
                >
                  ✏️ Modifier
                </button>
                <button
                  class="danger"
                  onclick={() => removePlanting(item.planting)}
                >
                  🗑️ Retirer
                </button>
              </div>
            {/if}
          </div>
        {/each}
      </aside>
    {/if}
  </div>
</div>

{#if configPopup}
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div class="popup-overlay" onclick={() => (configPopup = null)}>
    <div class="popup" onclick={(e) => e.stopPropagation()}>
      <h3>
        {getCrop(configPopup.cropId).emoji} Plantation de
        {getCrop(configPopup.cropId).name.toLowerCase()}s
      </h3>
      <div class="mode-switch">
        <button
          class:active={cfgMode === 'rows'}
          onclick={() => (cfgMode = 'rows')}
        >
          📏 Au rang
        </button>
        <button
          class:active={cfgMode === 'plants'}
          onclick={() => (cfgMode = 'plants')}
        >
          🌱 Par plant
        </button>
      </div>
      {#if cfgMode === 'rows'}
        <div class="mode-body">
          <label>
            Nombre de rangs
            <input type="number" min="1" step="1" bind:value={cfgRows} />
          </label>
          <label>
            Espacement entre les rangs (cm)
            <input type="number" min="1" step="1" bind:value={cfgRowSpacing} />
          </label>
          <label>
            Espacement entre les plants (cm)
            <input
              type="number"
              min="1"
              step="1"
              bind:value={cfgPlantSpacing}
            />
          </label>
        </div>
      {:else}
        <div class="mode-body">
          <p class="mode-hint">
            Chaque clic dans une zone place un plant à l'endroit exact du clic.
            Re-cliquez sur le légume ou appuyez sur Échap pour terminer.
          </p>
        </div>
      {/if}
      <div class="popup-actions">
        <button class="secondary" onclick={() => (configPopup = null)}>
          Annuler
        </button>
        <button class="primary" onclick={confirmConfig}>Valider</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .planning-screen {
    display: flex;
    flex-direction: column;
    height: 100%;
    padding: 1rem;
    gap: 1rem;
    overflow: hidden;
    box-sizing: border-box;
  }
  /* Tablette / mobile : canvas au-dessus, listes et détail empilés dessous */
  @media (max-width: 880px) {
    .planning-screen {
      padding: 0.6rem;
      gap: 0.6rem;
      overflow-y: auto;
    }
    .planning-screen .main {
      flex-direction: column;
      flex: none;
      min-height: 0;
    }
    .planning-screen .main aside {
      order: 2;
      width: 100%;
      max-height: none;
      overflow-y: visible;
    }
    .planning-screen .main .canvas-wrap {
      order: 1;
      flex: none;
      height: 45dvh;
      min-height: 280px;
    }
    .planning-screen .main .detail-panel {
      order: 3;
      width: 100%;
      max-height: none;
    }
    .planning-screen .timeline .month {
      font-size: 0.58rem;
    }
  }
  .timeline-wrap {
    display: flex;
    align-items: center;
    gap: 0.7rem;
  }
  .timeline-year {
    font-weight: 700;
    color: #2d4a22;
    font-size: 0.95rem;
  }
  .timeline {
    position: relative;
    flex: 1;
    display: flex;
    height: 36px;
    border: 1px solid var(--border);
    border-radius: 999px;
    overflow: hidden;
    cursor: pointer;
    background: var(--surface);
    user-select: none;
    box-shadow: var(--shadow-s);
  }
  .timeline .month {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.68rem;
    color: var(--text-muted);
    border-right: 1px solid #eef2e8;
    transition: background 0.15s ease;
  }
  .timeline .month:hover {
    background: var(--green-50);
  }
  .timeline .month:last-child {
    border-right: none;
  }
  .timeline .month.current-month {
    background: #dcebc8;
    color: #2d4a22;
    font-weight: 700;
  }
  .timeline .today-marker {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 3px;
    margin-left: -1.5px;
    background: #e0508a;
    pointer-events: none;
  }
  .timeline .today-marker::after {
    content: '';
    position: absolute;
    top: 0;
    left: -3.5px;
    border-left: 5px solid transparent;
    border-right: 5px solid transparent;
    border-top: 6px solid #e0508a;
  }
  .timeline .cursor {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 2px;
    margin-left: -1px;
    background: #2d4a22;
    pointer-events: none;
  }
  .timebar {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    flex-wrap: wrap;
  }
  .timebar label {
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }
  .timebar button {
    padding: 0.35rem 0.85rem;
    border: 1px solid var(--border);
    background: var(--surface);
    color: var(--green-800);
    border-radius: 999px;
    cursor: pointer;
    box-shadow: var(--shadow-s);
    font-size: 0.88rem;
  }
  .timebar button:hover {
    background: var(--green-100);
    border-color: var(--green-500);
  }
  .timebar button.today {
    border-style: dashed;
  }
  .date-label {
    font-weight: 600;
    color: #2d4a22;
    margin-left: auto;
  }
  .main {
    display: flex;
    gap: 1rem;
    flex: 1;
    min-height: 0;
  }
  aside {
    width: 250px;
    flex-shrink: 0;
    overflow-y: auto;
    min-height: 0;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-l);
    padding: 0.9rem;
    box-shadow: var(--shadow-s);
  }
  h2 {
    margin: 0 0 0.5rem;
    font-size: 1.1rem;
  }
  .crop-category {
    margin: 0.9rem 0 0.3rem;
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #6b7c5e;
    border-bottom: 1px solid #dde8d0;
    padding-bottom: 0.2rem;
  }
  aside ul {
    list-style: none;
    padding: 0;
    margin: 0;
  }
  aside ul li {
    margin-bottom: 0.25rem;
  }
  .crop {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    width: 100%;
    padding: 0.5rem 0.6rem;
    border: 1px solid var(--border);
    border-radius: var(--radius-m);
    background: var(--surface);
    cursor: pointer;
    text-align: left;
    box-shadow: var(--shadow-s);
  }
  .crop:hover {
    border-color: var(--green-500);
    transform: translateY(-1px);
    box-shadow: var(--shadow-m);
  }
  .crop.selected {
    border-color: var(--green-600);
    background: var(--green-100);
    box-shadow: 0 0 0 3px rgba(109, 166, 83, 0.2);
  }
  .crop .emoji {
    font-size: 1.4rem;
  }
  .crop .crop-text {
    display: flex;
    flex-direction: column;
    min-width: 0;
    flex: 1;
  }
  .crop .name {
    font-weight: 600;
  }
  .crop .window {
    font-size: 0.68rem;
    color: #888;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .crop .badge-plant {
    font-size: 0.95rem;
  }
  .crop.plantable-now {
    border-left: 4px solid #6da653;
  }
  .crop.plantable-shelter {
    border-left: 4px solid #7fb6d9;
  }
  .crop.plantable-now.selected,
  .crop.plantable-shelter.selected {
    border-color: #4a7c3a;
  }
  .invite {
    margin-top: 0.8rem;
    padding: 0.6rem;
    background: #fff6d9;
    border: 1px solid #e6c94a;
    border-radius: 8px;
    font-size: 0.9rem;
  }
  .invite .finish {
    display: block;
    margin-top: 0.5rem;
    padding: 0.3rem 0.7rem;
    border: 1px solid #4a7c3a;
    background: #fff;
    color: #2d4a22;
    border-radius: 6px;
    cursor: pointer;
    font-size: 0.85rem;
  }
  .invite .finish:hover {
    background: #e8f2df;
  }
  .mode-switch {
    display: flex;
    border: 1px solid #4a7c3a;
    border-radius: 6px;
    overflow: hidden;
  }
  .mode-switch button {
    flex: 1;
    border: none;
    background: #fff;
    color: #2d4a22;
    padding: 0.4rem 0.6rem;
    cursor: pointer;
    font-size: 0.85rem;
  }
  .mode-switch button + button {
    border-left: 1px solid #4a7c3a;
  }
  .mode-switch button:hover {
    background: #e8f2df;
  }
  .mode-switch button.active {
    background: #4a7c3a;
    color: #fff;
  }
  .mode-body {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
    /* Hauteur fixe pour que le popup ne change pas de taille entre
       les modes « au rang » (3 champs) et « par plant » (texte) */
    min-height: 200px;
  }
  .mode-hint {
    margin: 0;
    font-size: 0.82rem;
    color: #666;
  }
  button.mini {
    margin-left: 0.4rem;
    padding: 0.15rem 0.45rem;
    border: 1px solid #c25050;
    background: #fff;
    color: #a02020;
    border-radius: 5px;
    cursor: pointer;
    font-size: 0.72rem;
  }
  button.mini:hover {
    background: #fde3e3;
  }
  .hint {
    font-size: 0.85rem;
    color: #666;
  }
  .canvas-wrap {
    flex: 1;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
    position: relative;
  }
  .reset-view {
    position: absolute;
    top: 8px;
    right: 8px;
    z-index: 5;
    padding: 0.3rem 0.7rem;
    border: 1px solid #4a7c3a;
    background: rgba(255, 255, 255, 0.9);
    color: #2d4a22;
    border-radius: 6px;
    cursor: pointer;
    font-size: 0.8rem;
  }
  .reset-view:hover {
    background: #e8f2df;
  }
  .planting-banner {
    position: absolute;
    bottom: 12px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 5;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.45rem 0.9rem;
    background: rgba(45, 74, 34, 0.92);
    color: #fff;
    border-radius: 999px;
    font-size: 0.85rem;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25);
    white-space: nowrap;
  }
  .planting-banner button {
    padding: 0.25rem 0.7rem;
    border: none;
    border-radius: 999px;
    background: #fff;
    color: #2d4a22;
    font-size: 0.8rem;
    cursor: pointer;
  }
  .planting-banner button:hover {
    background: #e8f2df;
  }
  svg.panning {
    cursor: grabbing;
  }
  .empty {
    font-style: italic;
    color: #999;
  }
  svg {
    width: 100%;
    height: 100%;
    max-height: 100%;
    display: block;
    border-radius: var(--radius-l);
    box-shadow: var(--shadow-m);
    background: #cde3b8;
  }
  .ground {
    fill: #cde3b8;
  }
  .tree {
    pointer-events: none;
  }
  .tree circle {
    fill: #3f7d33;
    fill-opacity: 0.5;
    stroke: #2d5a24;
    stroke-width: 2;
  }
  .tree text {
    font-size: 24px;
    text-anchor: middle;
    dominant-baseline: central;
  }
  .tree text.tree-variety {
    font-size: 12px;
    fill: #2d5a24;
    paint-order: stroke;
    stroke: rgba(255, 255, 255, 0.75);
    stroke-width: 3;
  }
  .serre {
    pointer-events: none;
  }
  .row-line {
    stroke: rgba(255, 255, 255, 0.55);
    stroke-width: 1.5;
    pointer-events: none;
  }
  .plant-dot {
    fill: #eaf6da;
    stroke: #2d4a22;
    stroke-width: 0.8;
    pointer-events: none;
  }
  .plant-dot.free-plant {
    stroke-width: 1.2;
  }
  .rows-ready .plant-dot {
    fill: #ffd75e;
    stroke: #a67c00;
  }
  .popup-overlay {
    position: fixed;
    inset: 0;
    z-index: 200;
    background: rgba(20, 30, 15, 0.4);
    backdrop-filter: blur(3px);
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .popup {
    background: var(--surface);
    border-radius: var(--radius-l);
    padding: 1.3rem;
    min-width: min(320px, calc(100vw - 2rem));
    box-shadow: var(--shadow-l);
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
    animation: popup-in 0.18s ease;
  }
  @keyframes popup-in {
    from {
      opacity: 0;
      transform: translateY(8px) scale(0.98);
    }
    to {
      opacity: 1;
      transform: none;
    }
  }
  .popup h3 {
    margin: 0 0 0.4rem;
    font-size: 1.05rem;
  }
  .popup label {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    font-size: 0.85rem;
    color: #555;
  }
  .popup input {
    padding: 0.35rem 0.5rem;
    border: 1px solid #ccc;
    border-radius: 6px;
    font: inherit;
  }
  .popup-actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
    margin-top: 0.6rem;
  }
  .popup-actions button {
    padding: 0.4rem 0.9rem;
    border-radius: 6px;
    cursor: pointer;
    font-size: 0.9rem;
  }
  .popup-actions .primary {
    background: #4a7c3a;
    border: 1px solid #4a7c3a;
    color: #fff;
  }
  .popup-actions .primary:hover {
    background: #3d6830;
  }
  .popup-actions .secondary {
    background: #fff;
    border: 1px solid #ccc;
    color: #444;
  }
  .popup-actions .secondary:hover {
    background: #f2f2f2;
  }
  .serre rect {
    fill: #9ed8f0;
    fill-opacity: 0.3;
    stroke: #2b7ea1;
    stroke-width: 3;
    stroke-dasharray: 12 6;
  }
  .zone rect {
    fill: #8b5a2b;
    fill-opacity: 0.55;
    stroke: #6b4423;
    stroke-width: 2;
  }
  .zone {
    cursor: pointer;
    outline: none;
  }
  .zone.occupied rect {
    fill: #4a7c3a;
    fill-opacity: 0.7;
    stroke: #2d4a22;
  }
  .zone.ready rect {
    fill: #d9a418;
    fill-opacity: 0.75;
    stroke: #a67c00;
  }
  svg.planting-mode .zone.plantable rect {
    stroke: #2d7a2d;
    stroke-width: 4;
    stroke-dasharray: 10 5;
  }
  svg.planting-mode .zone.plantable:hover rect {
    fill: #6da653;
    fill-opacity: 0.6;
  }
  .zone text {
    text-anchor: middle;
    pointer-events: none;
    fill: #fff;
    paint-order: stroke;
    stroke: rgba(0, 0, 0, 0.45);
    stroke-width: 3;
  }
  .zone-label {
    font-size: 13px;
    font-weight: 600;
    text-anchor: start;
    fill: #3a2c1a;
    stroke: rgba(255, 255, 255, 0.7);
  }
  .zone.detail rect {
    stroke: #fff;
    stroke-width: 4;
    stroke-dasharray: 10 5;
  }
  .detail-panel {
    width: 250px;
    flex-shrink: 0;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-l);
    padding: 0.9rem;
    align-self: stretch;
    max-height: 100%;
    overflow-y: auto;
    box-shadow: var(--shadow-m);
  }
  .detail-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 0.5rem;
  }
  .detail-header h2 {
    margin: 0;
    font-size: 1.05rem;
  }
  .detail-header .close {
    background: none;
    border: none;
    cursor: pointer;
    font-size: 1rem;
    color: #888;
    padding: 0.1rem 0.3rem;
  }
  .detail-header .close:hover {
    color: #333;
  }
  .free-space {
    margin: 0 0 0.6rem;
    font-size: 0.8rem;
    color: #666;
  }
  .planting-card {
    border: 1px solid var(--border);
    border-radius: var(--radius-m);
    padding: 0.6rem;
    margin-bottom: 0.7rem;
    background: var(--green-50);
  }
  .planting-card h3 {
    margin: 0;
    font-size: 0.95rem;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .planting-card .status {
    font-size: 0.85rem;
  }
  .planting-card .variety-label {
    font-size: 0.8rem;
    font-weight: normal;
    font-style: italic;
    color: #666;
    flex: 1;
    margin-left: 0.3rem;
  }
  .card-actions {
    display: flex;
    gap: 0.4rem;
  }
  .card-actions button {
    flex: 1;
    padding: 0.35rem 0.5rem;
    border-radius: 6px;
    cursor: pointer;
    font-size: 0.8rem;
  }
  .card-actions .secondary {
    background: #fff;
    border: 1px solid #4a7c3a;
    color: #2d4a22;
  }
  .card-actions .secondary:hover {
    background: #e8f2df;
  }
  .planting-card dl {
    margin: 0 0 0.6rem;
  }
  .planting-card dd input {
    width: 100%;
    padding: 0.25rem 0.4rem;
    border: 1px solid #ccc;
    border-radius: 5px;
    font-size: 0.85rem;
  }
  .detail-panel dl {
    margin: 0 0 0.9rem;
  }
  .detail-panel dt {
    font-size: 0.72rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: #888;
    margin-top: 0.6rem;
  }
  .detail-panel dd {
    margin: 0.1rem 0 0;
    font-size: 0.9rem;
    color: #213021;
  }
  .detail-panel button.danger {
    width: 100%;
    padding: 0.45rem;
    background: #fff;
    border: 1px solid #c25050;
    color: #a02020;
    border-radius: 6px;
    cursor: pointer;
    font-size: 0.88rem;
  }
  .detail-panel button.danger:hover {
    background: #fde3e3;
  }
</style>
