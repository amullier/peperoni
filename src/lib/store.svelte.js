// Store global de l'application (Svelte 5 runes)
import { CROPS } from './crops.js'
import { addDays, addMonths, compareISO, todayISO } from './dates.js'

const STORAGE_KEY = 'peperoni-data'
const DATA_VERSION = 1

// Échelle du terrain : 60 unités internes = 1 mètre
export const UNITS_PER_M = 60
// Marge conservée en bord de zone pour l'empilement des rangs
export const ROWS_MARGIN = 8

function defaultData() {
  return {
    version: DATA_VERSION,
    zones: [],
    plantings: [],
    trees: [],
    serres: [],
  }
}

function loadFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return defaultData()
    const parsed = JSON.parse(raw)
    return validateData(parsed) ? parsed : defaultData()
  } catch {
    return defaultData()
  }
}

export function validateData(data) {
  return (
    data &&
    typeof data === 'object' &&
    Array.isArray(data.zones) &&
    Array.isArray(data.plantings) &&
    (data.trees === undefined || Array.isArray(data.trees)) &&
    data.zones.every(
      (z) =>
        typeof z.id === 'string' &&
        typeof z.name === 'string' &&
        [z.x, z.y, z.w, z.h].every((n) => typeof n === 'number')
    ) &&
    data.plantings.every(
      (p) =>
        typeof p.id === 'string' &&
        typeof p.zoneId === 'string' &&
        typeof p.cropId === 'string' &&
        typeof p.plantedDate === 'string' &&
        (p.rows === undefined || typeof p.rows === 'number') &&
        (p.rowSpacingCm === undefined || typeof p.rowSpacingCm === 'number') &&
        (p.plantSpacingCm === undefined ||
          typeof p.plantSpacingCm === 'number') &&
        (p.mode === undefined || typeof p.mode === 'string') &&
        (p.variety === undefined ||
          p.variety === null ||
          typeof p.variety === 'string') &&
        (p.plants === undefined ||
          (Array.isArray(p.plants) &&
            p.plants.every(
              (pt) => typeof pt.x === 'number' && typeof pt.y === 'number'
            )))
    ) &&
    (data.trees ?? []).every(
      (t) =>
        typeof t.id === 'string' &&
        typeof t.type === 'string' &&
        typeof t.x === 'number' &&
        typeof t.y === 'number' &&
        (t.variety === undefined ||
          t.variety === null ||
          typeof t.variety === 'string')
    ) &&
    (data.serres === undefined || Array.isArray(data.serres)) &&
    (data.serres ?? []).every(
      (s) =>
        typeof s.id === 'string' &&
        typeof s.name === 'string' &&
        [s.x, s.y, s.w, s.h].every((n) => typeof n === 'number')
    ) &&
    (data.cropOverrides === undefined ||
      (typeof data.cropOverrides === 'object' &&
        !Array.isArray(data.cropOverrides) &&
        Object.values(data.cropOverrides).every(
          (o) =>
            o &&
            typeof o === 'object' &&
            Object.values(o).every((v) => typeof v === 'number')
        ))) &&
    (data.hiddenCrops === undefined ||
      (Array.isArray(data.hiddenCrops) &&
        data.hiddenCrops.every((id) => typeof id === 'string'))) &&
    (data.customCrops === undefined ||
      (typeof data.customCrops === 'object' &&
        !Array.isArray(data.customCrops) &&
        Object.values(data.customCrops).every(
          (c) =>
            c &&
            typeof c === 'object' &&
            typeof c.id === 'string' &&
            typeof c.name === 'string' &&
            typeof c.category === 'string'
        )))
  )
}

let uid = () =>
  Date.now().toString(36) + Math.random().toString(36).slice(2, 8)

// Renommages d'identifiants de légumes entre versions du catalogue
const CROP_ID_RENAMES = { potiron: 'courges' }

// Applique les renommages aux données chargées / importées
function migrateCropIds(data) {
  for (const p of data.plantings ?? []) {
    if (CROP_ID_RENAMES[p.cropId]) p.cropId = CROP_ID_RENAMES[p.cropId]
  }
  if (data.cropOverrides) {
    for (const [oldId, newId] of Object.entries(CROP_ID_RENAMES)) {
      if (data.cropOverrides[oldId] && !data.cropOverrides[newId]) {
        data.cropOverrides[newId] = data.cropOverrides[oldId]
      }
      delete data.cropOverrides[oldId]
    }
  }
  if (data.hiddenCrops) {
    data.hiddenCrops = data.hiddenCrops.map((id) => CROP_ID_RENAMES[id] ?? id)
  }
  return data
}

class Store {
  zones = $state([])
  plantings = $state([])
  trees = $state([])
  serres = $state([])
  cropOverrides = $state({}) // surcharges des métriques par légume
  hiddenCrops = $state([]) // légumes masqués dans la planification
  customCrops = $state({}) // légumes ajoutés par l'utilisateur (id → crop)
  currentDate = $state(todayISO())

  constructor() {
    const data = migrateCropIds(loadFromStorage())
    this.zones = data.zones
    this.plantings = data.plantings
    this.trees = data.trees ?? []
    this.serres = data.serres ?? []
    this.cropOverrides = data.cropOverrides ?? {}
    this.hiddenCrops = data.hiddenCrops ?? []
    this.customCrops = data.customCrops ?? {}
  }

  save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this.serialize()))
  }

  serialize() {
    return {
      version: DATA_VERSION,
      zones: this.zones,
      plantings: this.plantings,
      trees: this.trees,
      serres: this.serres,
      cropOverrides: this.cropOverrides,
      hiddenCrops: this.hiddenCrops,
      customCrops: this.customCrops,
    }
  }

  get hasData() {
    return (
      this.zones.length > 0 ||
      this.plantings.length > 0 ||
      this.trees.length > 0 ||
      this.serres.length > 0
    )
  }

  importData(data) {
    data = migrateCropIds(data)
    this.zones = data.zones
    this.plantings = data.plantings
    this.trees = data.trees ?? []
    this.serres = data.serres ?? []
    this.cropOverrides = data.cropOverrides ?? {}
    this.hiddenCrops = data.hiddenCrops ?? []
    this.customCrops = data.customCrops ?? {}
    this.save()
  }

  // Efface toutes les données (zones, plantations, arbres, serres,
  // surcharges et légumes masqués)
  clearAll() {
    this.importData(defaultData())
  }

  // --- Visibilité des légumes ---

  isCropHidden(cropId) {
    return this.hiddenCrops.includes(cropId)
  }

  toggleCropHidden(cropId) {
    this.hiddenCrops = this.isCropHidden(cropId)
      ? this.hiddenCrops.filter((id) => id !== cropId)
      : [...this.hiddenCrops, cropId]
    this.save()
  }

  // --- Légumes personnalisés ---

  // Palette de couleurs attribuées aux légumes ajoutés par l'utilisateur
  static CUSTOM_CROP_COLORS = [
    '#7d6608',
    '#1a5276',
    '#7b241c',
    '#4a235a',
    '#0e6251',
    '#784212',
    '#2c3e50',
    '#9c640c',
  ]

  // Un légume : depuis le catalogue ou les légumes personnalisés
  getCrop(id) {
    return CROPS[id] ?? this.customCrops[id]
  }

  // Tous les légumes connus (catalogue + personnalisés)
  get allCrops() {
    return [...Object.values(CROPS), ...Object.values(this.customCrops)]
  }

  isCustomCrop(id) {
    return !!this.customCrops[id]
  }

  addCustomCrop({ name, emoji, category }) {
    const id = 'custom-' + uid()
    const colors = Store.CUSTOM_CROP_COLORS
    const color =
      colors[Object.keys(this.customCrops).length % colors.length]
    this.customCrops[id] = {
      id,
      name,
      emoji: emoji || '🥦',
      color,
      category,
      // Métriques par défaut, ajustables ensuite dans le tableau
      harvestFromMonths: 2,
      totalMonths: 4,
      shelterHarvestFromMonths: 1,
      shelterTotalMonths: 4,
      rowSpacingCm: 40,
      plantSpacingCm: 20,
      // Plantable toute l'année par défaut
      plantWindows: [[1, 12]],
      shelterPlantWindows: [[1, 12]],
      varieties: [],
    }
    this.save()
    return this.customCrops[id]
  }

  removeCustomCrop(id) {
    if (!this.customCrops[id]) return
    const { [id]: _removed, ...rest } = this.customCrops
    this.customCrops = rest
    this.plantings = this.plantings.filter((p) => p.cropId !== id)
    this.hiddenCrops = this.hiddenCrops.filter((c) => c !== id)
    this.resetCropOverrides(id)
    this.save()
  }

  // --- Métriques des légumes (défauts + surcharges du paramétrage) ---

  cropMetrics(cropId) {
    const base = this.getCrop(cropId) ?? {}
    const o = this.cropOverrides[cropId] ?? {}
    return {
      // Début de récolte possible (mois après plantation)
      harvestFromMonths: o.harvestFromMonths ?? base.harvestFromMonths ?? 2,
      // Temps de culture total : au-delà, la culture disparaît
      totalMonths: o.totalMonths ?? base.totalMonths ?? 4,
      // Déclinaisons sous abri (serre)
      shelterHarvestFromMonths:
        o.shelterHarvestFromMonths ??
        base.shelterHarvestFromMonths ??
        Math.max(1, (base.harvestFromMonths ?? 2) - 1),
      shelterTotalMonths:
        o.shelterTotalMonths ?? base.shelterTotalMonths ?? base.totalMonths ?? 4,
      rowSpacingCm: o.rowSpacingCm ?? base.rowSpacingCm ?? 40,
      plantSpacingCm: o.plantSpacingCm ?? base.plantSpacingCm ?? 20,
      // Semis en godet : jours entre semis et implantation (0 = semis direct)
      nurseryDays: o.nurseryDays ?? base.nurseryDays ?? 0,
    }
  }

  setCropOverride(cropId, field, value) {
    if (!this.cropOverrides[cropId]) this.cropOverrides[cropId] = {}
    this.cropOverrides[cropId][field] = value
    this.save()
  }

  resetCropOverrides(cropId) {
    const { [cropId]: _removed, ...rest } = this.cropOverrides
    this.cropOverrides = rest
    this.save()
  }

  hasCropOverrides(cropId) {
    return Object.keys(this.cropOverrides[cropId] ?? {}).length > 0
  }

  // --- Zones ---

  addZone(rect) {
    const zone = {
      id: uid(),
      name: `Zone ${this.zones.length + 1}`,
      ...rect,
    }
    this.zones.push(zone)
    this.save()
    return zone
  }

  renameZone(id, name) {
    const zone = this.zones.find((z) => z.id === id)
    if (zone) {
      zone.name = name
      this.save()
    }
  }

  updateZone(id, patch) {
    const zone = this.zones.find((z) => z.id === id)
    if (zone) {
      Object.assign(zone, patch)
      this.save()
    }
  }

  // Ajoute une copie d'une zone. Si `at` est fourni, la copie est collée
  // à cette position (coin haut-gauche), sinon avec un léger décalage.
  pasteZone(source, bounds, at = null) {
    const offset = 20
    let x = at ? at.x : source.x + offset
    let y = at ? at.y : source.y + offset
    x = Math.max(0, Math.min(x, bounds.w - source.w))
    y = Math.max(0, Math.min(y, bounds.h - source.h))
    const zone = {
      id: uid(),
      name: `${source.name} (copie)`,
      x,
      y,
      w: source.w,
      h: source.h,
    }
    this.zones.push(zone)
    this.save()
    return zone
  }


  removeZone(id) {
    this.zones = this.zones.filter((z) => z.id !== id)
    this.plantings = this.plantings.filter((p) => p.zoneId !== id)
    this.save()
  }

  // --- Serres ---

  addSerre(rect) {
    const serre = {
      id: uid(),
      name: `Serre ${this.serres.length + 1}`,
      ...rect,
    }
    this.serres.push(serre)
    this.save()
    return serre
  }

  updateSerre(id, patch) {
    const serre = this.serres.find((s) => s.id === id)
    if (serre) {
      Object.assign(serre, patch)
      this.save()
    }
  }

  removeSerre(id) {
    this.serres = this.serres.filter((s) => s.id !== id)
    this.save()
  }

  // Une zone est « sous abri » si elle est entièrement couverte par une serre
  isZoneSheltered(zone) {
    return this.serres.some(
      (s) =>
        zone.x >= s.x &&
        zone.y >= s.y &&
        zone.x + zone.w <= s.x + s.w &&
        zone.y + zone.h <= s.y + s.h
    )
  }

  // --- Arbres (éléments fixes) ---

  addTree(type, x, y, variety = null) {
    const tree = { id: uid(), type, x, y, variety }
    this.trees.push(tree)
    this.save()
    return tree
  }

  updateTree(id, patch) {
    const tree = this.trees.find((t) => t.id === id)
    if (tree) {
      Object.assign(tree, patch)
      this.save()
    }
  }

  removeTree(id) {
    this.trees = this.trees.filter((t) => t.id !== id)
    this.save()
  }

  // --- Plantations ---

  // Une plantation est "active" entre sa date de plantation et la fin
  // de son temps de culture total (ensuite elle disparaît).
  plantingEnd(planting) {
    const metrics = this.cropMetrics(planting.cropId)
    return addMonths(
      planting.plantedDate,
      this.isPlantingSheltered(planting)
        ? metrics.shelterTotalMonths
        : metrics.totalMonths
    )
  }

  plantingHarvestStart(planting) {
    const metrics = this.cropMetrics(planting.cropId)
    return addMonths(
      planting.plantedDate,
      this.isPlantingSheltered(planting)
        ? metrics.shelterHarvestFromMonths
        : metrics.harvestFromMonths
    )
  }

  isPlantingSheltered(planting) {
    const zone = this.zones.find((z) => z.id === planting.zoneId)
    return zone ? this.isZoneSheltered(zone) : false
  }

  // Date du semis en godet (pépinière), ou null si le légume se sème
  // directement en place (nurseryDays = 0)
  plantingSowingDate(planting) {
    const days = this.cropMetrics(planting.cropId).nurseryDays
    if (!days) return null
    return addDays(planting.plantedDate, -days)
  }

  isActiveAt(planting, dateISO) {
    return (
      compareISO(planting.plantedDate, dateISO) <= 0 &&
      compareISO(dateISO, this.plantingEnd(planting)) < 0
    )
  }

  activePlantingForZone(zoneId, dateISO = this.currentDate) {
    return this.plantings.find(
      (p) => p.zoneId === zoneId && this.isActiveAt(p, dateISO)
    )
  }

  // Toutes les plantations actives d'une zone (dans l'ordre de plantation)
  activePlantingsForZone(zoneId, dateISO = this.currentDate) {
    return this.plantings.filter(
      (p) => p.zoneId === zoneId && this.isActiveAt(p, dateISO)
    )
  }

  // Emprise des rangs d'une plantation le long de l'axe d'empilement
  // (en unités) : seuls les écarts ENTRE rangs comptent, le premier rang
  // est posé au début de l'espace disponible.
  plantingRowsExtent(planting) {
    const cmToUnits = UNITS_PER_M / 100
    return ((planting.rows ?? 1) - 1) * (planting.rowSpacingCm ?? 40) * cmToUnits
  }

  // Longueur disponible pour empiler des rangs dans une zone (petit côté)
  zoneCapacityUnits(zone) {
    return Math.min(zone.w, zone.h) - ROWS_MARGIN * 2
  }

  // Espace occupé : emprise de chaque plantation + un séparateur (égal à
  // l'espacement de rangs de la plantation) entre plantations successives.
  // Les plantations « par plant » (placement libre) ne comptent pas.
  zoneUsedUnits(zone, dateISO = this.currentDate) {
    const cmToUnits = UNITS_PER_M / 100
    return this.activePlantingsForZone(zone.id, dateISO)
      .filter((p) => p.mode !== 'plants')
      .reduce(
        (sum, p, i) =>
          sum +
          this.plantingRowsExtent(p) +
          (i > 0 ? (p.rowSpacingCm ?? 40) * cmToUnits : 0),
        0
      )
  }

  // Peut-on ajouter cette configuration de rangs dans la zone ?
  canPlant(zone, config, dateISO = this.currentDate) {
    const cmToUnits = UNITS_PER_M / 100
    const rowGap = (config.rowSpacingCm ?? 40) * cmToUnits
    const extent = ((config.rows ?? 1) - 1) * rowGap
    const hasOthers =
      this.activePlantingsForZone(zone.id, dateISO).length > 0
    const needed = extent + (hasOthers ? rowGap : 0)
    return (
      this.zoneUsedUnits(zone, dateISO) + needed <=
      this.zoneCapacityUnits(zone)
    )
  }

  // Statut d'une plantation à une date donnée : 'growing' | 'ready'
  plantingStatus(planting, dateISO = this.currentDate) {
    const harvestStart = this.plantingHarvestStart(planting)
    return compareISO(dateISO, harvestStart) < 0 ? 'growing' : 'ready'
  }

  plant(zoneId, cropId, config = {}) {
    const zone = this.zones.find((z) => z.id === zoneId)
    if (!zone) return null
    const metrics = this.cropMetrics(cropId)
    const fullConfig = {
      rows: config.rows ?? 1,
      rowSpacingCm: config.rowSpacingCm ?? metrics.rowSpacingCm,
      plantSpacingCm: config.plantSpacingCm ?? metrics.plantSpacingCm,
    }
    // Pas de blocage si la place manque : l'appelant affiche un avertissement
    const planting = {
      id: uid(),
      zoneId,
      cropId,
      plantedDate: this.currentDate,
      ...fullConfig,
    }
    this.plantings.push(planting)
    this.save()
    return planting
  }

  // Plantation « par plant » : ajoute un plant à la position (x, y) de la
  // zone. Réutilise la plantation libre du même légume créée à la même date
  // dans la zone, sinon en crée une nouvelle.
  plantAt(zoneId, cropId, x, y) {
    let planting = this.plantings.find(
      (p) =>
        p.mode === 'plants' &&
        p.zoneId === zoneId &&
        p.cropId === cropId &&
        p.plantedDate === this.currentDate
    )
    if (planting) {
      planting.plants.push({ x, y })
    } else {
      planting = {
        id: uid(),
        zoneId,
        cropId,
        plantedDate: this.currentDate,
        mode: 'plants',
        plants: [{ x, y }],
      }
      this.plantings.push(planting)
    }
    this.save()
    return planting
  }

  // Retire le dernier plant d'une plantation libre (supprime la plantation
  // s'il n'en reste plus)
  removeLastPlant(id) {
    const planting = this.plantings.find((p) => p.id === id)
    if (!planting?.plants?.length) return
    planting.plants.pop()
    if (planting.plants.length === 0) {
      this.plantings = this.plantings.filter((p) => p.id !== id)
    }
    this.save()
  }

  // Estimation du nombre de plants d'une plantation : nombre exact pour
  // les plantations « par plant », sinon rangs × plants/rang (le long du
  // grand côté de la zone)
  estimatePlantCount(planting) {
    if (planting.mode === 'plants') return planting.plants?.length ?? 0
    const zone = this.zones.find((z) => z.id === planting.zoneId)
    if (!zone) return 0
    const cmToUnits = UNITS_PER_M / 100
    const plantGap = (planting.plantSpacingCm ?? 20) * cmToUnits
    const margin = Math.max(6, plantGap / 2)
    const length = Math.max(zone.w, zone.h) - margin * 2
    if (length <= 0) return 0
    const perRow = Math.floor(length / plantGap) + 1
    return (planting.rows ?? 1) * perRow
  }

  removePlanting(id) {
    this.plantings = this.plantings.filter((p) => p.id !== id)
    this.save()
  }

  updatePlanting(id, patch) {
    const planting = this.plantings.find((p) => p.id === id)
    if (planting) {
      Object.assign(planting, patch)
      this.save()
    }
  }

  // --- Navigation temporelle ---

  shiftDate(months) {
    this.currentDate = addMonths(this.currentDate, months)
  }
}

export const store = new Store()
