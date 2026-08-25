<script>
  import { store } from './store.svelte.js'
  import { TREES, getTree } from './trees.js'
  import { showConfirm } from './dialog.svelte.js'

  // Dimensions logiques du terrain (unités internes)
  const W = 1000
  const H = 600

  // Échelle : 60 unités = 1 mètre → terrain d'environ 16,7 m × 10 m
  const UNITS_PER_M = 60
  const GRID = UNITS_PER_M / 10 // précision : 0,1 m
  // Taille minimale d'une zone : 0,5 m
  const MIN_SIZE = UNITS_PER_M / 2

  // Conversion unités internes ↔ mètres (au dixième)
  function toM(units) {
    return Math.round((units / UNITS_PER_M) * 10) / 10
  }
  function toUnits(meters) {
    return Math.round(meters * UNITS_PER_M)
  }
  // Arrondit une valeur en unités au dixième de mètre le plus proche
  function roundToGrid(units) {
    return Math.round(units / GRID) * GRID
  }
  function formatM(units) {
    return toM(units).toLocaleString('fr-FR')
  }

  let svgEl
  let drawing = $state(null) // { x0, y0, x1, y1 } pendant le tracé
  let dragging = $state(null) // { id, offX, offY, moved } pendant un déplacement de zone
  let resizing = $state(null) // { id, left, right, top, bottom, moved } pendant un redimensionnement
  let draggingTree = $state(null) // { id, moved } pendant un déplacement d'arbre
  let editingId = $state(null)
  let editingKind = $state(null) // 'zone' | 'serre'
  let editName = $state('')
  let selectedId = $state(null)
  let selectedTreeId = $state(null)
  let selectedSerreId = $state(null)
  let treeTool = $state(null) // type d'arbre en cours de placement (ex: 'pommier')
  let serreTool = $state(false) // mode tracé de serre
  let clipboard = $state(null) // copie d'une zone { name, x, y, w, h }
  let guides = $state({ x: [], y: [] }) // lignes d'ancrage affichées
  let ctxMenu = $state(null) // { x, y, zoneId } menu contextuel
  let varietyPopup = $state(null) // { treeId } popup de choix de variété
  let varietyChoice = $state('')

  const treeList = Object.values(TREES)

  // --- Autocomplete de choix d'arbre ---

  let treeSearch = $state('')
  let treeDropdownOpen = $state(false)

  function normalize(text) {
    return text
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
  }

  let treeMatches = $derived(
    treeList.filter((t) => normalize(t.name).includes(normalize(treeSearch)))
  )
  let treeMatchGroups = $derived(
    [
      {
        label: 'Arbres',
        items: treeMatches.filter((t) => t.group !== 'petit-fruit'),
      },
      {
        label: 'Petits fruits',
        items: treeMatches.filter((t) => t.group === 'petit-fruit'),
      },
    ].filter((g) => g.items.length > 0)
  )

  function pickTree(tree) {
    treeTool = tree.id
    serreTool = false
    treeSearch = tree.name
    treeDropdownOpen = false
  }

  function clearTreeTool() {
    treeTool = null
    treeSearch = ''
    treeDropdownOpen = false
  }

  // --- Vue : zoom (Ctrl + molette) et pan (clic milieu) ---

  let view = $state({ x: 0, y: 0, w: W, h: H })
  let panning = $state(null) // { startX, startY, viewX, viewY }
  let isZoomed = $derived(view.w < W || view.x !== 0 || view.y !== 0)

  function clampView(value, max) {
    return Math.max(0, Math.min(max, value))
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

  let selectedZone = $derived(store.zones.find((z) => z.id === selectedId))
  let selectedTree = $derived(store.trees.find((t) => t.id === selectedTreeId))
  let selectedSerre = $derived(
    store.serres.find((s) => s.id === selectedSerreId)
  )
  let ctxZone = $derived(
    ctxMenu ? store.zones.find((z) => z.id === ctxMenu.zoneId) : null
  )

  // Rayon d'affichage de la couronne d'un arbre (en unités)
  function treeRadius(tree) {
    return (getTree(tree.type).canopyM * UNITS_PER_M) / 2
  }

  // Nom affiché d'un arbre : nom du type (ex. « Pommier »)
  function treeName(tree) {
    return getTree(tree.type).name
  }

  function toSvgPoint(event) {
    const pt = new DOMPoint(event.clientX, event.clientY)
    const { x, y } = pt.matrixTransform(svgEl.getScreenCTM().inverse())
    return {
      x: Math.max(0, Math.min(W, x)),
      y: Math.max(0, Math.min(H, y)),
    }
  }

  // --- Ancrage (snapping) sur les bords des autres zones ---

  const SNAP = 8 // tolérance d'accrochage (unités du terrain)

  function snapCandidates(excludeId = null) {
    const xs = [0, W]
    const ys = [0, H]
    for (const z of store.zones) {
      if (z.id === excludeId) continue
      xs.push(z.x, z.x + z.w)
      ys.push(z.y, z.y + z.h)
    }
    for (const s of store.serres) {
      if (s.id === excludeId) continue
      xs.push(s.x, s.x + s.w)
      ys.push(s.y, s.y + s.h)
    }
    return { xs, ys }
  }

  // Retourne la valeur ancrée la plus proche, ou null si rien à portée
  function snapValue(value, candidates) {
    let best = null
    let bestDist = SNAP + 1
    for (const c of candidates) {
      const d = Math.abs(value - c)
      if (d < bestDist) {
        best = c
        bestDist = d
      }
    }
    return best
  }

  function snapPoint(x, y, excludeId = null) {
    const { xs, ys } = snapCandidates(excludeId)
    const sx = snapValue(x, xs)
    const sy = snapValue(y, ys)
    guides = {
      x: sx !== null ? [sx] : [],
      y: sy !== null ? [sy] : [],
    }
    return { x: sx !== null ? sx : x, y: sy !== null ? sy : y }
  }

  function clearGuides() {
    guides = { x: [], y: [] }
  }

  function normalized(d) {
    return {
      x: Math.min(d.x0, d.x1),
      y: Math.min(d.y0, d.y1),
      w: Math.abs(d.x1 - d.x0),
      h: Math.abs(d.y1 - d.y0),
    }
  }

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
      svgEl.setPointerCapture(event.pointerId)
      return
    }
    if (event.button !== 0 || editingId) return
    selectedId = null
    selectedTreeId = null
    selectedSerreId = null
    const p = toSvgPoint(event)
    if (treeTool) {
      // Mode placement d'arbre : un clic pose l'arbre
      const tree = store.addTree(treeTool, roundToGrid(p.x), roundToGrid(p.y))
      selectedTreeId = tree.id
      if (getTree(tree.type).varieties.length > 0) openVarietyPopup(tree)
      return
    }
    const { x, y } = snapPoint(p.x, p.y)
    drawing = { x0: x, y0: y, x1: x, y1: y, isSerre: serreTool }
    svgEl.setPointerCapture(event.pointerId)
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
      return
    }
    if (drawing) {
      const p = toSvgPoint(event)
      const { x, y } = snapPoint(p.x, p.y)
      drawing = { ...drawing, x1: x, y1: y }
    } else if (resizing) {
      const zone = store.zones.find((z) => z.id === resizing.id)
      if (!zone) return
      const p = toSvgPoint(event)
      const { xs, ys } = snapCandidates(zone.id)
      const gx = []
      const gy = []
      if (resizing.left) {
        let nx = Math.max(0, Math.min(p.x, zone.x + zone.w - MIN_SIZE))
        const s = snapValue(nx, xs)
        if (s !== null && s <= zone.x + zone.w - MIN_SIZE) {
          nx = s
          gx.push(s)
        }
        nx = roundToGrid(nx)
        zone.w = zone.x + zone.w - nx
        zone.x = nx
      }
      if (resizing.right) {
        let nr = Math.min(W, Math.max(p.x, zone.x + MIN_SIZE))
        const s = snapValue(nr, xs)
        if (s !== null && s >= zone.x + MIN_SIZE) {
          nr = s
          gx.push(s)
        }
        zone.w = roundToGrid(nr) - zone.x
      }
      if (resizing.top) {
        let ny = Math.max(0, Math.min(p.y, zone.y + zone.h - MIN_SIZE))
        const s = snapValue(ny, ys)
        if (s !== null && s <= zone.y + zone.h - MIN_SIZE) {
          ny = s
          gy.push(s)
        }
        ny = roundToGrid(ny)
        zone.h = zone.y + zone.h - ny
        zone.y = ny
      }
      if (resizing.bottom) {
        let nb = Math.min(H, Math.max(p.y, zone.y + MIN_SIZE))
        const s = snapValue(nb, ys)
        if (s !== null && s >= zone.y + MIN_SIZE) {
          nb = s
          gy.push(s)
        }
        zone.h = roundToGrid(nb) - zone.y
      }
      guides = { x: gx, y: gy }
      resizing.moved = true
      gaps = computeGaps(zone)
    } else if (draggingTree) {
      const tree = store.trees.find((t) => t.id === draggingTree.id)
      if (!tree) return
      const p = toSvgPoint(event)
      tree.x = roundToGrid(p.x)
      tree.y = roundToGrid(p.y)
      draggingTree.moved = true
    } else if (dragging) {
      const list = dragging.kind === 'serre' ? store.serres : store.zones
      const zone = list.find((z) => z.id === dragging.id)
      if (!zone) return
      const p = toSvgPoint(event)
      let nx = Math.max(0, Math.min(W - zone.w, p.x - dragging.offX))
      let ny = Math.max(0, Math.min(H - zone.h, p.y - dragging.offY))

      // Accroche le bord le plus proche (gauche/droite, haut/bas)
      const { xs, ys } = snapCandidates(zone.id)
      const gx = []
      const gy = []
      const leftSnap = snapValue(nx, xs)
      const rightSnap = snapValue(nx + zone.w, xs)
      if (
        leftSnap !== null &&
        (rightSnap === null ||
          Math.abs(leftSnap - nx) <= Math.abs(rightSnap - (nx + zone.w)))
      ) {
        nx = leftSnap
        gx.push(leftSnap)
      } else if (rightSnap !== null) {
        nx = rightSnap - zone.w
        gx.push(rightSnap)
      }
      const topSnap = snapValue(ny, ys)
      const bottomSnap = snapValue(ny + zone.h, ys)
      if (
        topSnap !== null &&
        (bottomSnap === null ||
          Math.abs(topSnap - ny) <= Math.abs(bottomSnap - (ny + zone.h)))
      ) {
        ny = topSnap
        gy.push(topSnap)
      } else if (bottomSnap !== null) {
        ny = bottomSnap - zone.h
        gy.push(bottomSnap)
      }
      guides = { x: gx, y: gy }

      zone.x = roundToGrid(nx)
      zone.y = roundToGrid(ny)
      dragging.moved = true
      gaps = computeGaps(zone)
    }
  }

  // --- Cotes d'écart avec les zones voisines pendant un déplacement ---

  let gaps = $state([]) // [{ x1, y1, x2, y2, label }]

  function computeGaps(zone) {
    // Pour chaque côté, on garde la zone voisine la plus proche
    // qui fait face à la zone déplacée
    const best = { left: null, right: null, top: null, bottom: null }
    for (const o of store.zones) {
      if (o.id === zone.id) continue
      const oy1 = Math.max(zone.y, o.y)
      const oy2 = Math.min(zone.y + zone.h, o.y + o.h)
      if (oy2 > oy1) {
        // Chevauchement vertical → voisin à gauche ou à droite
        if (o.x + o.w <= zone.x) {
          const gap = zone.x - (o.x + o.w)
          if (!best.left || gap < best.left.gap)
            best.left = { gap, mid: (oy1 + oy2) / 2 }
        } else if (o.x >= zone.x + zone.w) {
          const gap = o.x - (zone.x + zone.w)
          if (!best.right || gap < best.right.gap)
            best.right = { gap, mid: (oy1 + oy2) / 2 }
        }
      }
      const ox1 = Math.max(zone.x, o.x)
      const ox2 = Math.min(zone.x + zone.w, o.x + o.w)
      if (ox2 > ox1) {
        // Chevauchement horizontal → voisin au-dessus ou en dessous
        if (o.y + o.h <= zone.y) {
          const gap = zone.y - (o.y + o.h)
          if (!best.top || gap < best.top.gap)
            best.top = { gap, mid: (ox1 + ox2) / 2 }
        } else if (o.y >= zone.y + zone.h) {
          const gap = o.y - (zone.y + zone.h)
          if (!best.bottom || gap < best.bottom.gap)
            best.bottom = { gap, mid: (ox1 + ox2) / 2 }
        }
      }
    }

    const list = []
    if (best.left && best.left.gap > 0) {
      list.push({
        x1: zone.x - best.left.gap,
        y1: best.left.mid,
        x2: zone.x,
        y2: best.left.mid,
        label: `${formatM(best.left.gap)} m`,
      })
    }
    if (best.right && best.right.gap > 0) {
      list.push({
        x1: zone.x + zone.w,
        y1: best.right.mid,
        x2: zone.x + zone.w + best.right.gap,
        y2: best.right.mid,
        label: `${formatM(best.right.gap)} m`,
      })
    }
    if (best.top && best.top.gap > 0) {
      list.push({
        x1: best.top.mid,
        y1: zone.y - best.top.gap,
        x2: best.top.mid,
        y2: zone.y,
        label: `${formatM(best.top.gap)} m`,
      })
    }
    if (best.bottom && best.bottom.gap > 0) {
      list.push({
        x1: best.bottom.mid,
        y1: zone.y + zone.h,
        x2: best.bottom.mid,
        y2: zone.y + zone.h + best.bottom.gap,
        label: `${formatM(best.bottom.gap)} m`,
      })
    }
    return list
  }

  function onPointerUp() {
    if (panning) {
      panning = null
      return
    }
    if (drawing) {
      const rect = normalized(drawing)
      const isSerre = drawing.isSerre
      drawing = null
      clearGuides()
      if (rect.w >= MIN_SIZE && rect.h >= MIN_SIZE) {
        const bounds = {
          x: roundToGrid(rect.x),
          y: roundToGrid(rect.y),
          w: Math.max(MIN_SIZE, roundToGrid(rect.w)),
          h: Math.max(MIN_SIZE, roundToGrid(rect.h)),
        }
        if (isSerre) {
          const serre = store.addSerre(bounds)
          selectedSerreId = serre.id
          serreTool = false
        } else {
          const zone = store.addZone(bounds)
          selectedId = zone.id
          startRename(zone)
        }
      }
    } else if (resizing) {
      if (resizing.moved) store.save()
      resizing = null
      clearGuides()
      gaps = []
    } else if (draggingTree) {
      if (draggingTree.moved) store.save()
      draggingTree = null
    } else if (dragging) {
      if (dragging.moved) store.save()
      dragging = null
      clearGuides()
      gaps = []
    }
  }

  function onZonePointerDown(event, zone) {
    if (event.button !== 0 || editingId || treeTool || serreTool) return
    // Empêche le démarrage d'un tracé lorsqu'on clique sur une zone
    event.stopPropagation()
    selectedId = zone.id
    selectedTreeId = null
    selectedSerreId = null
    const p = toSvgPoint(event)
    dragging = {
      kind: 'zone',
      id: zone.id,
      offX: p.x - zone.x,
      offY: p.y - zone.y,
      moved: false,
    }
    svgEl.setPointerCapture(event.pointerId)
  }

  function onSerrePointerDown(event, serre) {
    if (event.button !== 0 || editingId || treeTool || serreTool) return
    event.stopPropagation()
    selectedSerreId = serre.id
    selectedId = null
    selectedTreeId = null
    const p = toSvgPoint(event)
    dragging = {
      kind: 'serre',
      id: serre.id,
      offX: p.x - serre.x,
      offY: p.y - serre.y,
      moved: false,
    }
    svgEl.setPointerCapture(event.pointerId)
  }

  async function deleteSerre(serre) {
    if (
      await showConfirm(
        `Supprimer la ${serre.name} ? (les zones restent en place)`,
        { title: 'Supprimer la serre', okLabel: 'Supprimer', danger: true }
      )
    ) {
      if (selectedSerreId === serre.id) selectedSerreId = null
      store.removeSerre(serre.id)
    }
  }

  function onHandlePointerDown(event, zone, edges) {
    if (event.button !== 0 || editingId || treeTool || serreTool) return
    event.stopPropagation()
    selectedId = zone.id
    selectedTreeId = null
    selectedSerreId = null
    resizing = { id: zone.id, ...edges, moved: false }
    svgEl.setPointerCapture(event.pointerId)
  }

  function onTreePointerDown(event, tree) {
    if (event.button !== 0 || editingId || treeTool || serreTool) return
    event.stopPropagation()
    selectedTreeId = tree.id
    selectedId = null
    selectedSerreId = null
    draggingTree = { id: tree.id, moved: false }
    svgEl.setPointerCapture(event.pointerId)
  }

  async function deleteTree(tree) {
    if (
      await showConfirm(`Supprimer « ${treeName(tree)} » ?`, {
        title: "Supprimer l'arbre",
        okLabel: 'Supprimer',
        danger: true,
      })
    ) {
      if (selectedTreeId === tree.id) selectedTreeId = null
      store.removeTree(tree.id)
    }
  }

  // --- Popup de choix de variété d'un arbre ---

  let varietyTree = $derived(
    varietyPopup ? store.trees.find((t) => t.id === varietyPopup.treeId) : null
  )

  function openVarietyPopup(tree) {
    varietyChoice = tree.variety ?? ''
    varietyPopup = { treeId: tree.id }
  }

  function confirmVariety() {
    if (varietyPopup) {
      store.updateTree(varietyPopup.treeId, { variety: varietyChoice || null })
    }
    varietyPopup = null
  }

  // --- Menu contextuel (clic droit sur une zone) ---

  function onZoneContextMenu(event, zone) {
    event.preventDefault()
    event.stopPropagation()
    selectedId = zone.id
    selectedTreeId = null
    ctxMenu = { x: event.clientX, y: event.clientY, zoneId: zone.id, at: null }
  }

  // Clic droit sur le fond du terrain : menu « Coller ici »
  function onGroundContextMenu(event) {
    event.preventDefault()
    event.stopPropagation()
    const at = toSvgPoint(event)
    ctxMenu = { x: event.clientX, y: event.clientY, zoneId: null, at }
  }

  function closeCtxMenu() {
    ctxMenu = null
  }

  function ctxAction(action) {
    const zone = ctxZone
    const at = ctxMenu?.at ?? null
    closeCtxMenu()
    if (action === 'paste') {
      pasteZone(at)
      return
    }
    if (!zone) return
    if (action === 'copy') copyZone(zone)
    else if (action === 'rename') startRename(zone)
    else if (action === 'delete') deleteZone(zone)
  }

  function startRename(obj, kind = 'zone') {
    editingId = obj.id
    editingKind = kind
    editName = obj.name ?? ''
  }

  function commitRename() {
    if (editingId && editName.trim()) {
      const name = editName.trim()
      if (editingKind === 'zone') store.renameZone(editingId, name)
      else if (editingKind === 'serre') store.updateSerre(editingId, { name })
    }
    editingId = null
    editingKind = null
  }

  async function deleteZone(zone) {
    const hasPlantings = store.plantings.some((p) => p.zoneId === zone.id)
    const msg = hasPlantings
      ? `Supprimer la zone « ${zone.name} » et ses plantations ?`
      : `Supprimer la zone « ${zone.name} » ?`
    if (
      await showConfirm(msg, {
        title: 'Supprimer la zone',
        okLabel: 'Supprimer',
        danger: true,
      })
    ) {
      if (selectedId === zone.id) selectedId = null
      store.removeZone(zone.id)
    }
  }

  // --- Édition des dimensions (saisie en mètres, précision 0,1 m) ---

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, Math.round(value)))
  }

  function updateDimension(zone, field, rawValue) {
    const meters = Number(String(rawValue).replace(',', '.'))
    if (!Number.isFinite(meters)) return
    const value = roundToGrid(toUnits(meters))
    const patch = {}
    if (field === 'x') patch.x = clamp(value, 0, W - zone.w)
    if (field === 'y') patch.y = clamp(value, 0, H - zone.h)
    if (field === 'w') patch.w = clamp(value, MIN_SIZE, W - zone.x)
    if (field === 'h') patch.h = clamp(value, MIN_SIZE, H - zone.y)
    store.updateZone(zone.id, patch)
  }

  // --- Copier / coller ---

  function copyZone(zone) {
    clipboard = { name: zone.name, x: zone.x, y: zone.y, w: zone.w, h: zone.h }
  }

  function pasteZone(at = null) {
    if (!clipboard) return
    const zone = store.pasteZone(
      clipboard,
      { w: W, h: H },
      at ? { x: roundToGrid(at.x), y: roundToGrid(at.y) } : null
    )
    selectedId = zone.id
  }

  function onKeyDown(event) {
    // Ignore les raccourcis quand on tape dans un champ
    const tag = event.target?.tagName
    if (tag === 'INPUT' || tag === 'TEXTAREA') return
    if (event.key === 'Escape') {
      treeTool = null
      treeSearch = ''
      serreTool = false
      closeCtxMenu()
      varietyPopup = null
    } else if (event.ctrlKey && event.key === 'c' && selectedZone) {
      copyZone(selectedZone)
      event.preventDefault()
    } else if (event.ctrlKey && event.key === 'v' && clipboard) {
      pasteZone()
      event.preventDefault()
    } else if (event.key === 'Delete' && selectedTree) {
      deleteTree(selectedTree)
      event.preventDefault()
    } else if (event.key === 'Delete' && selectedSerre) {
      deleteSerre(selectedSerre)
      event.preventDefault()
    } else if (event.key === 'Delete' && selectedZone) {
      deleteZone(selectedZone)
      event.preventDefault()
    }
  }

  // Position du libellé : au-dessus de la zone, ou juste en dessous du bord
  // supérieur du terrain si la zone touche le haut
  function labelY(zone) {
    return zone.y >= 18 ? zone.y - 6 : zone.y + zone.h + 16
  }
</script>

<svelte:window
  onkeydown={onKeyDown}
  onclick={closeCtxMenu}
  oncontextmenu={() => ctxMenu && closeCtxMenu()}
/>

<div class="terrain-screen">
  <aside>
    <h2>Mes zones</h2>
    <p class="hint">
      Tracez un rectangle sur le terrain (cliquer-glisser) pour créer une zone
      de culture.
    </p>

    <div class="clipboard-actions">
      <button
        class="small"
        disabled={!selectedZone}
        onclick={() => copyZone(selectedZone)}
      >
        📋 Copier
      </button>
      <button class="small" disabled={!clipboard} onclick={() => pasteZone()}>
        📄 Coller
      </button>
    </div>
    {#if clipboard}
      <p class="clipboard-info">Presse-papiers : « {clipboard.name} »</p>
    {/if}

    {#if store.zones.length === 0}
      <p class="empty">Aucune zone pour l'instant.</p>
    {/if}
    <ul>
      {#each store.zones as zone (zone.id)}
        <li class:selected={selectedId === zone.id}>
          <div class="zone-row">
            {#if editingId === zone.id}
              <!-- svelte-ignore a11y_autofocus -->
              <input
                type="text"
                bind:value={editName}
                onblur={commitRename}
                onkeydown={(e) => e.key === 'Enter' && commitRename()}
                autofocus
              />
            {:else}
              <button class="zone-name" onclick={() => (selectedId = zone.id)}>
                {zone.name}
                {#if store.isZoneSheltered(zone)}
                  <span class="badge">sous abri</span>
                {/if}
              </button>
              <button class="icon" title="Renommer" onclick={() => startRename(zone)}>
                ✏️
              </button>
              <button class="icon" title="Copier" onclick={() => copyZone(zone)}>
                📋
              </button>
              <button class="icon" title="Supprimer" onclick={() => deleteZone(zone)}>
                🗑️
              </button>
            {/if}
          </div>

          {#if selectedId === zone.id}
            <div class="dims">
              <label>
                Largeur (m)
                <input
                  type="number"
                  step="0.1"
                  min={toM(MIN_SIZE)}
                  max={toM(W - zone.x)}
                  value={toM(zone.w)}
                  onchange={(e) => updateDimension(zone, 'w', e.target.value)}
                />
              </label>
              <label>
                Hauteur (m)
                <input
                  type="number"
                  step="0.1"
                  min={toM(MIN_SIZE)}
                  max={toM(H - zone.y)}
                  value={toM(zone.h)}
                  onchange={(e) => updateDimension(zone, 'h', e.target.value)}
                />
              </label>
            </div>
          {/if}
        </li>
      {/each}
    </ul>

    <h2 class="trees-title">Arbres & petits fruits</h2>
    <p class="hint">
      Éléments fixes du terrain : cherchez un arbre ou un petit fruit
      (framboisier, fraisier…), puis cliquez sur le terrain pour le placer.
    </p>
    <div class="tree-tools">
      <div class="tree-search">
        <input
          type="text"
          placeholder="🔍 Chercher un arbre…"
          bind:value={treeSearch}
          onfocus={() => (treeDropdownOpen = true)}
          oninput={() => {
            treeDropdownOpen = true
            treeTool = null
          }}
          onkeydown={(e) => {
            if (e.key === 'Escape') clearTreeTool()
            if (e.key === 'Enter' && treeMatches.length > 0)
              pickTree(treeMatches[0])
          }}
          onblur={() => setTimeout(() => (treeDropdownOpen = false), 150)}
        />
        {#if treeTool || treeSearch}
          <button
            class="clear"
            title="Annuler"
            onclick={clearTreeTool}
          >
            ✕
          </button>
        {/if}
        {#if treeDropdownOpen && treeMatches.length > 0}
          <ul class="tree-dropdown">
            {#each treeMatchGroups as group (group.label)}
              <li class="group-label">{group.label}</li>
              {#each group.items as tree (tree.id)}
                <li>
                  <button
                    class:active={treeTool === tree.id}
                    onpointerdown={(e) => {
                      e.preventDefault()
                      pickTree(tree)
                    }}
                  >
                    <span>{tree.emoji} {tree.name}</span>
                    <span class="canopy">⌀ {tree.canopyM} m</span>
                  </button>
                </li>
              {/each}
            {/each}
          </ul>
        {/if}
      </div>
    </div>
    {#if treeTool}
      <p class="invite">
        👉 Cliquez sur le terrain pour planter un
        {getTree(treeTool).name.toLowerCase()} (Échap pour annuler).
      </p>
    {/if}
    {#if store.trees.length > 0}
      <ul>
        {#each store.trees as tree (tree.id)}
          <li class:selected={selectedTreeId === tree.id}>
            <div class="zone-row">
              <button
                class="zone-name"
                onclick={() => ((selectedTreeId = tree.id), (selectedId = null))}
              >
                {getTree(tree.type).emoji} {treeName(tree)}
                {#if tree.variety}
                  <span class="variety">({tree.variety})</span>
                {/if}
              </button>
              {#if getTree(tree.type).varieties.length > 0}
                <button
                  class="icon"
                  title="Choisir la variété"
                  onclick={() => openVarietyPopup(tree)}
                >
                  🏷️
                </button>
              {/if}
              <button class="icon" title="Supprimer" onclick={() => deleteTree(tree)}>
                🗑️
              </button>
            </div>
          </li>
        {/each}
      </ul>
    {/if}

    <h2 class="trees-title">Serres</h2>
    <p class="hint">
      Les zones entièrement couvertes par une serre sont marquées « sous
      abri ».
    </p>
    <div class="tree-tools">
      <button
        class="small"
        class:active={serreTool}
        onclick={() => {
          serreTool = !serreTool
          treeTool = null
        }}
      >
        🏠 Tracer une serre
      </button>
    </div>
    {#if serreTool}
      <p class="invite">
        👉 Tracez un rectangle sur le terrain pour poser la serre (Échap pour
        annuler).
      </p>
    {/if}
    {#if store.serres.length > 0}
      <ul>
        {#each store.serres as serre (serre.id)}
          <li class:selected={selectedSerreId === serre.id}>
            <div class="zone-row">
              {#if editingId === serre.id}
                <!-- svelte-ignore a11y_autofocus -->
                <input
                  type="text"
                  bind:value={editName}
                  onblur={commitRename}
                  onkeydown={(e) => e.key === 'Enter' && commitRename()}
                  autofocus
                />
              {:else}
                <button
                  class="zone-name"
                  onclick={() => {
                    selectedSerreId = serre.id
                    selectedId = null
                    selectedTreeId = null
                  }}
                >
                  🏠 {serre.name}
                </button>
                <button
                  class="icon"
                  title="Renommer"
                  onclick={() => startRename(serre, 'serre')}
                >
                  ✏️
                </button>
                <button class="icon" title="Supprimer" onclick={() => deleteSerre(serre)}>
                  🗑️
                </button>
              {/if}
            </div>
          </li>
        {/each}
      </ul>
    {/if}
  </aside>

  <div class="canvas-wrap">
    <svg
      bind:this={svgEl}
      viewBox="{view.x} {view.y} {view.w} {view.h}"
      class:tree-mode={treeTool}
      class:serre-mode={serreTool}
      onpointerdown={onPointerDown}
      oncontextmenu={onGroundContextMenu}
      onpointermove={onPointerMove}
      onpointerup={onPointerUp}
      role="application"
      aria-label="Terrain : tracez des zones de culture"
    >
      <!-- fond -->
      <rect x="0" y="0" width={W} height={H} class="ground" />

      {#each store.zones as zone (zone.id)}
        <g
          class="zone"
          class:selected={selectedId === zone.id}
          onpointerdown={(e) => onZonePointerDown(e, zone)}
          oncontextmenu={(e) => onZoneContextMenu(e, zone)}
          role="button"
          tabindex="0"
          onkeydown={(e) => e.key === 'Enter' && (selectedId = zone.id)}
        >
          <rect class="body" x={zone.x} y={zone.y} width={zone.w} height={zone.h} rx="6" />
          <text class="zone-label" x={zone.x + 4} y={labelY(zone)}>
            {zone.name}{store.isZoneSheltered(zone) ? ' • sous abri' : ''}
          </text>

          <!-- Poignées de redimensionnement (bords et coins) -->
          <rect
            role="presentation" class="handle edge-h"
            x={zone.x + 14}
            y={zone.y - 4}
            width={Math.max(0, zone.w - 28)}
            height="8"
            onpointerdown={(e) => onHandlePointerDown(e, zone, { top: true })}
          />
          <rect
            role="presentation" class="handle edge-h"
            x={zone.x + 14}
            y={zone.y + zone.h - 4}
            width={Math.max(0, zone.w - 28)}
            height="8"
            onpointerdown={(e) => onHandlePointerDown(e, zone, { bottom: true })}
          />
          <rect
            role="presentation" class="handle edge-v"
            x={zone.x - 4}
            y={zone.y + 14}
            width="8"
            height={Math.max(0, zone.h - 28)}
            onpointerdown={(e) => onHandlePointerDown(e, zone, { left: true })}
          />
          <rect
            role="presentation" class="handle edge-v"
            x={zone.x + zone.w - 4}
            y={zone.y + 14}
            width="8"
            height={Math.max(0, zone.h - 28)}
            onpointerdown={(e) => onHandlePointerDown(e, zone, { right: true })}
          />
          <circle
            role="presentation" class="handle corner nwse"
            cx={zone.x}
            cy={zone.y}
            r="7"
            onpointerdown={(e) =>
              onHandlePointerDown(e, zone, { left: true, top: true })}
          />
          <circle
            role="presentation" class="handle corner nesw"
            cx={zone.x + zone.w}
            cy={zone.y}
            r="7"
            onpointerdown={(e) =>
              onHandlePointerDown(e, zone, { right: true, top: true })}
          />
          <circle
            role="presentation" class="handle corner nesw"
            cx={zone.x}
            cy={zone.y + zone.h}
            r="7"
            onpointerdown={(e) =>
              onHandlePointerDown(e, zone, { left: true, bottom: true })}
          />
          <circle
            role="presentation" class="handle corner nwse"
            cx={zone.x + zone.w}
            cy={zone.y + zone.h}
            r="7"
            onpointerdown={(e) =>
              onHandlePointerDown(e, zone, { right: true, bottom: true })}
          />
        </g>
      {/each}

      <!-- Arbres (éléments fixes) -->
      {#each store.trees as tree (tree.id)}
        <g
          class="tree"
          class:selected={selectedTreeId === tree.id}
          onpointerdown={(e) => onTreePointerDown(e, tree)}
          role="button"
          tabindex="0"
          onkeydown={(e) => e.key === 'Enter' && (selectedTreeId = tree.id)}
        >
          <circle class="canopy" cx={tree.x} cy={tree.y} r={treeRadius(tree)} />
          <text class="tree-emoji" x={tree.x} y={tree.y}>
            {getTree(tree.type).emoji}
          </text>
          <text class="tree-variety" x={tree.x} y={tree.y + treeRadius(tree) + 14}>
            {treeName(tree)}{tree.variety ? ` (${tree.variety})` : ''}
          </text>
        </g>
      {/each}

      <!-- Serres (au-dessus des zones, seul le cadre est interactif) -->
      {#each store.serres as serre (serre.id)}
        <g class="serre" class:selected={selectedSerreId === serre.id}>
          <rect
            class="glass"
            x={serre.x}
            y={serre.y}
            width={serre.w}
            height={serre.h}
            rx="4"
          />
          <rect
            role="presentation"
            class="frame"
            x={serre.x}
            y={serre.y}
            width={serre.w}
            height={serre.h}
            rx="4"
            onpointerdown={(e) => onSerrePointerDown(e, serre)}
          />
          <text class="serre-label" x={serre.x + serre.w - 6} y={serre.y + 18}>
            🏠 {serre.name}
          </text>
        </g>
      {/each}

      {#if drawing}
        {@const r = normalized(drawing)}
        <rect
          class="preview"
          class:preview-serre={drawing.isSerre}
          x={r.x}
          y={r.y}
          width={r.w}
          height={r.h}
          rx="6"
        />
      {/if}

      <!-- Lignes d'ancrage -->
      {#each guides.x as gx (gx)}
        <line class="guide" x1={gx} y1="0" x2={gx} y2={H} />
      {/each}
      {#each guides.y as gy (gy)}
        <line class="guide" x1="0" y1={gy} x2={W} y2={gy} />
      {/each}

      <!-- Cotes d'écart pendant le déplacement -->
      {#each gaps as g}
        {@const vertical = g.x1 === g.x2}
        <g class="gap">
          <line x1={g.x1} y1={g.y1} x2={g.x2} y2={g.y2} />
          {#if vertical}
            <line x1={g.x1 - 6} y1={g.y1} x2={g.x1 + 6} y2={g.y1} />
            <line x1={g.x2 - 6} y1={g.y2} x2={g.x2 + 6} y2={g.y2} />
            <text x={g.x1 + 10} y={(g.y1 + g.y2) / 2}>{g.label}</text>
          {:else}
            <line x1={g.x1} y1={g.y1 - 6} x2={g.x1} y2={g.y1 + 6} />
            <line x1={g.x2} y1={g.y2 - 6} x2={g.x2} y2={g.y2 + 6} />
            <text x={(g.x1 + g.x2) / 2} y={g.y1 - 8} class="centered">
              {g.label}
            </text>
          {/if}
        </g>
      {/each}
    </svg>
    <p class="shortcuts">
      Astuce : glissez une zone pour la déplacer — elle s'accroche aux bords
      des autres zones (lignes roses). <kbd>Ctrl+C</kbd> / <kbd>Ctrl+V</kbd>
      pour copier/coller, <kbd>Suppr</kbd> pour supprimer,
      <kbd>Ctrl+molette</kbd> pour zoomer, clic milieu pour déplacer la vue.
      {#if isZoomed}
        <button class="small" onclick={resetView}>🔍 Vue d'ensemble</button>
      {/if}
    </p>
  </div>
</div>

{#if ctxMenu}
  <div class="ctx-menu" style="left: {ctxMenu.x}px; top: {ctxMenu.y}px">
    {#if ctxZone}
      <button onclick={() => ctxAction('copy')}>📋 Copier</button>
      <button disabled={!clipboard} onclick={() => ctxAction('paste')}>
        📄 Coller
      </button>
      <button onclick={() => ctxAction('rename')}>✏️ Renommer</button>
      <button class="danger" onclick={() => ctxAction('delete')}>
        🗑️ Supprimer
      </button>
    {:else}
      <button disabled={!clipboard} onclick={() => ctxAction('paste')}>
        📄 Coller ici
      </button>
    {/if}
  </div>
{/if}

{#if varietyPopup && varietyTree}
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div class="popup-overlay" onclick={confirmVariety}>
    <div class="popup" onclick={(e) => e.stopPropagation()}>
      <h3>
        {getTree(varietyTree.type).emoji} Variété du
        {getTree(varietyTree.type).name.toLowerCase()}
      </h3>
      <label>
        Variété
        <select bind:value={varietyChoice}>
          <option value="">— Sans variété —</option>
          {#each getTree(varietyTree.type).varieties as v (v)}
            <option value={v}>{v}</option>
          {/each}
        </select>
      </label>
      <div class="popup-actions">
        <button class="secondary" onclick={() => (varietyPopup = null)}>
          Annuler
        </button>
        <button class="primary" onclick={confirmVariety}>Valider</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .terrain-screen {
    display: flex;
    gap: 1rem;
    padding: 1rem;
    height: 100%;
    overflow: hidden;
    box-sizing: border-box;
  }
  /* Tablette / mobile : canvas au-dessus, panneau latéral empilé dessous */
  @media (max-width: 880px) {
    .terrain-screen {
      flex-direction: column;
      overflow-y: auto;
      padding: 0.6rem;
      gap: 0.6rem;
    }
    .terrain-screen aside {
      order: 2;
      width: 100%;
      overflow-y: visible;
    }
    .terrain-screen .canvas-wrap {
      order: 1;
      flex: none;
      height: 55dvh;
      min-height: 300px;
    }
  }
  aside {
    width: 260px;
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
  .hint {
    font-size: 0.85rem;
    color: #666;
  }
  .empty {
    font-style: italic;
    color: #999;
  }
  .clipboard-actions {
    display: flex;
    gap: 0.5rem;
    margin-bottom: 0.3rem;
  }
  button.small {
    padding: 0.25rem 0.7rem;
    border: 1px solid var(--border);
    background: var(--surface);
    color: var(--green-800);
    border-radius: 999px;
    cursor: pointer;
    font-size: 0.85rem;
    box-shadow: var(--shadow-s);
  }
  button.small:hover:not(:disabled) {
    background: var(--green-100);
    border-color: var(--green-500);
  }
  button.small:disabled {
    opacity: 0.45;
    cursor: default;
  }
  .clipboard-info {
    font-size: 0.75rem;
    color: #888;
    margin: 0 0 0.5rem;
  }
  ul {
    list-style: none;
    padding: 0;
    margin: 0;
  }
  li {
    padding: 0.35rem 0.3rem;
    border-bottom: 1px solid #eee;
    border-left: 3px solid transparent;
  }
  li.selected {
    background: #eef5e6;
    border-left-color: #4a7c3a;
  }
  .zone-row {
    display: flex;
    align-items: center;
    gap: 0.3rem;
  }
  button.zone-name {
    flex: 1;
    text-align: left;
    background: none;
    border: none;
    cursor: pointer;
    padding: 0.15rem 0.2rem;
    font-size: 0.95rem;
    color: inherit;
  }
  .zone-row input {
    flex: 1;
    min-width: 0;
  }
  button.icon {
    background: none;
    border: none;
    cursor: pointer;
    padding: 0.1rem;
  }
  .dims {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.4rem;
    padding: 0.5rem 0.2rem 0.3rem;
  }
  .dims label {
    display: flex;
    flex-direction: column;
    font-size: 0.72rem;
    color: #666;
    gap: 0.15rem;
  }
  .dims input {
    width: 100%;
    padding: 0.2rem 0.4rem;
    border: 1px solid #ccc;
    border-radius: 5px;
    font-size: 0.85rem;
  }
  .canvas-wrap {
    flex: 1;
    min-width: 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }
  svg {
    width: 100%;
    flex: 1;
    min-height: 0;
    display: block;
    border-radius: var(--radius-l);
    box-shadow: var(--shadow-m);
    cursor: crosshair;
    touch-action: none;
  }
  .shortcuts {
    font-size: 0.78rem;
    color: #888;
    margin: 0.4rem 0 0;
  }
  kbd {
    background: #eee;
    border: 1px solid #ccc;
    border-radius: 4px;
    padding: 0 0.3rem;
    font-size: 0.75rem;
  }
  .ground {
    fill: #cde3b8;
  }
  .zone {
    outline: none;
    cursor: move;
  }
  .zone rect.body {
    fill: #8b5a2b;
    fill-opacity: 0.55;
    stroke: #6b4423;
    stroke-width: 2;
  }
  .zone.selected rect.body {
    stroke: #2d4a22;
    stroke-width: 4;
    stroke-dasharray: 10 5;
  }
  .handle {
    fill: transparent;
    stroke: none;
  }
  .handle.edge-h {
    cursor: ns-resize;
  }
  .handle.edge-v {
    cursor: ew-resize;
  }
  .handle.corner.nwse {
    cursor: nwse-resize;
  }
  .handle.corner.nesw {
    cursor: nesw-resize;
  }
  /* Coins visibles au survol ou quand la zone est sélectionnée */
  .zone:hover .handle.corner,
  .zone.selected .handle.corner {
    fill: #fff;
    stroke: #2d4a22;
    stroke-width: 1.5;
  }
  svg.tree-mode .handle {
    pointer-events: none;
  }
  svg.serre-mode {
    cursor: crosshair;
  }
  svg.serre-mode .zone,
  svg.serre-mode .tree,
  svg.serre-mode .handle,
  svg.serre-mode .serre .frame {
    pointer-events: none;
  }
  .serre .glass {
    fill: #9ed8f0;
    fill-opacity: 0.3;
    stroke: none;
    pointer-events: none;
  }
  .serre .frame {
    fill: none;
    stroke: #2b7ea1;
    stroke-width: 3;
    stroke-dasharray: 12 6;
    pointer-events: stroke;
    cursor: move;
  }
  .serre.selected .frame {
    stroke-width: 5;
  }
  .serre-label {
    fill: #175a77;
    font-size: 13px;
    font-weight: 600;
    text-anchor: end;
    pointer-events: none;
    paint-order: stroke;
    stroke: rgba(255, 255, 255, 0.75);
    stroke-width: 3;
  }
  .preview-serre {
    fill: #9ed8f0;
    fill-opacity: 0.35;
    stroke: #2b7ea1;
  }
  .badge {
    display: inline-block;
    background: #d2ecf7;
    color: #175a77;
    border-radius: 10px;
    padding: 0 0.45rem;
    font-size: 0.68rem;
    vertical-align: middle;
  }
  .zone-label {
    fill: #3a2c1a;
    font-size: 13px;
    font-weight: 600;
    pointer-events: none;
    paint-order: stroke;
    stroke: rgba(255, 255, 255, 0.7);
    stroke-width: 3;
  }
  .preview {
    fill: #6da653;
    fill-opacity: 0.4;
    stroke: #4a7c3a;
    stroke-width: 2;
    stroke-dasharray: 8 4;
  }
  .guide {
    stroke: #e0508a;
    stroke-width: 1.5;
    stroke-dasharray: 6 4;
    pointer-events: none;
  }
  .gap {
    pointer-events: none;
  }
  .gap line {
    stroke: #1565c0;
    stroke-width: 1.5;
  }
  .gap text {
    fill: #1565c0;
    font-size: 13px;
    font-weight: 600;
    dominant-baseline: middle;
    paint-order: stroke;
    stroke: rgba(255, 255, 255, 0.85);
    stroke-width: 3;
  }
  .gap text.centered {
    text-anchor: middle;
  }
  .trees-title {
    margin-top: 1.2rem;
  }
  .tree-tools {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin-bottom: 0.4rem;
  }
  .tree-search {
    position: relative;
    width: 100%;
  }
  .tree-search input {
    width: 100%;
    box-sizing: border-box;
    padding: 0.4rem 1.8rem 0.4rem 0.6rem;
    border: 1px solid #ccc;
    border-radius: 6px;
    font: inherit;
    font-size: 0.85rem;
  }
  .tree-search input:focus {
    outline: none;
    border-color: #4a7c3a;
  }
  .tree-search .clear {
    position: absolute;
    top: 50%;
    right: 0.4rem;
    transform: translateY(-50%);
    background: none;
    border: none;
    cursor: pointer;
    color: #888;
    font-size: 0.85rem;
    padding: 0.1rem;
  }
  .tree-search .clear:hover {
    color: #333;
  }
  .tree-dropdown {
    position: absolute;
    top: calc(100% + 2px);
    left: 0;
    right: 0;
    z-index: 50;
    margin: 0;
    padding: 0.2rem;
    list-style: none;
    background: #fff;
    border: 1px solid #ccc;
    border-radius: 6px;
    box-shadow: 0 6px 20px rgba(0, 0, 0, 0.18);
    max-height: 260px;
    overflow-y: auto;
  }
  .tree-dropdown li.group-label {
    padding: 0.35rem 0.5rem 0.15rem;
    font-size: 0.68rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #6b7c5e;
  }
  .tree-dropdown li button {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    width: 100%;
    padding: 0.35rem 0.5rem;
    border: none;
    background: none;
    border-radius: 5px;
    cursor: pointer;
    font-size: 0.85rem;
    text-align: left;
  }
  .tree-dropdown li button:hover {
    background: #e8f2df;
  }
  .tree-dropdown li button.active {
    background: #4a7c3a;
    color: #fff;
  }
  .tree-dropdown .canopy {
    font-size: 0.72rem;
    color: #999;
    white-space: nowrap;
  }
  .tree-dropdown li button.active .canopy {
    color: #dfeee0;
  }
  button.small.active {
    background: #4a7c3a;
    color: #fff;
  }
  .invite {
    padding: 0.5rem;
    background: #fff6d9;
    border: 1px solid #e6c94a;
    border-radius: 8px;
    font-size: 0.85rem;
  }
  svg.tree-mode {
    cursor: copy;
  }
  .tree {
    outline: none;
    cursor: move;
  }
  svg.tree-mode .tree {
    pointer-events: none;
  }
  .canopy {
    fill: #3f7d33;
    fill-opacity: 0.5;
    stroke: #2d5a24;
    stroke-width: 2;
  }
  .tree.selected .canopy {
    stroke-width: 4;
    stroke-dasharray: 8 4;
  }
  .tree-emoji {
    font-size: 24px;
    text-anchor: middle;
    dominant-baseline: central;
    pointer-events: none;
  }
  .tree-variety {
    font-size: 12px;
    text-anchor: middle;
    fill: #2d5a24;
    pointer-events: none;
    paint-order: stroke;
    stroke: rgba(255, 255, 255, 0.75);
    stroke-width: 3;
  }
  .variety {
    color: #888;
    font-size: 0.8em;
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
    min-width: min(300px, calc(100vw - 2rem));
    box-shadow: var(--shadow-l);
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
    margin: 0 0 0.8rem;
    font-size: 1.05rem;
  }
  .popup label {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
    font-size: 0.85rem;
    color: #555;
  }
  .popup select {
    padding: 0.4rem 0.5rem;
    border: 1px solid #ccc;
    border-radius: 6px;
    font: inherit;
  }
  .popup-actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
    margin-top: 1rem;
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
  .ctx-menu {
    position: fixed;
    z-index: 100;
    display: flex;
    flex-direction: column;
    min-width: 160px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-m);
    box-shadow: var(--shadow-l);
    padding: 0.3rem;
    animation: popup-in 0.12s ease;
  }
  .ctx-menu button {
    background: none;
    border: none;
    text-align: left;
    padding: 0.4rem 0.7rem;
    border-radius: 5px;
    cursor: pointer;
    font-size: 0.9rem;
  }
  .ctx-menu button:hover:not(:disabled) {
    background: #e8f2df;
  }
  .ctx-menu button:disabled {
    opacity: 0.45;
    cursor: default;
  }
  .ctx-menu button.danger:hover {
    background: #fde3e3;
    color: #a02020;
  }
</style>
