import { useEffect, useMemo, useRef, useState } from 'react'
import L from 'leaflet'
import {
  CircleMarker,
  MapContainer,
  Marker,
  Pane,
  Polyline,
  Rectangle,
  Tooltip,
  ZoomControl,
  useMap,
  useMapEvents,
} from 'react-leaflet'
import { Crosshair, Layers3, MapPin, Maximize2, Route as RouteIcon, Tags } from 'lucide-react'
import type { Incident, Network, Road, Route } from '../types'
import { congestionColors, formatNumber, roadColor, roadWeight, routeColors, titleCase } from '../lib/format'
import { cx } from '../lib/cx'
import { Badge } from './ui'

export type PickMode = 'origin' | 'destination' | null

interface TrafficMapProps {
  network: Network
  routes?: Route[]
  selectedRouteId?: string | null
  incidents?: Incident[]
  origin?: string | null
  destination?: string | null
  showTraffic?: boolean
  showAlternatives?: boolean
  showLabels?: boolean
  pickMode?: PickMode
  onPick?: (nodeId: string, mode: 'origin' | 'destination') => void
  onRoadSelect?: (road: Road) => void
  clock?: string
  compact?: boolean
  className?: string
  initialCenter?: [number, number]
  initialZoom?: number
}

const MAP_H = 800
const MAP_W = 1200

const point = (x: number, y: number): [number, number] => [MAP_H - y, x]

function FitBounds({ compact }: { compact?: boolean }) {
  const map = useMap()
  useEffect(() => {
    const timer = window.setTimeout(() => {
      map.invalidateSize()
      map.fitBounds(
        [
          [-20, -20],
          [MAP_H + 20, MAP_W + 20],
        ],
        { padding: compact ? [10, 10] : [18, 18], animate: false },
      )
    }, 60)
    return () => window.clearTimeout(timer)
  }, [map, compact])
  return null
}

function ClickCapture({
  pickMode,
  network,
  onPick,
}: {
  pickMode: PickMode
  network: Network
  onPick?: TrafficMapProps['onPick']
}) {
  useMapEvents({
    click(event) {
      if (!pickMode || !onPick) return
      let best: { id: string; distance: number } | null = null
      const y = MAP_H - event.latlng.lat
      for (const node of network.nodes) {
        const distance = (node.x - event.latlng.lng) ** 2 + (node.y - y) ** 2
        if (!best || distance < best.distance) best = { id: node.id, distance }
      }
      if (best) onPick(best.id, pickMode)
    },
  })
  return null
}

function districtLabels(network: Network) {
  const groups = new Map<string, { x: number; y: number; count: number }>()
  for (const node of network.nodes) {
    const current = groups.get(node.district) ?? { x: 0, y: 0, count: 0 }
    current.x += node.x
    current.y += node.y
    current.count += 1
    groups.set(node.district, current)
  }
  return [...groups.entries()].map(([label, value]) => ({
    label,
    x: value.x / value.count,
    y: value.y / value.count,
  }))
}

export function TrafficMap({
  network,
  routes = [],
  selectedRouteId,
  incidents = [],
  origin,
  destination,
  showTraffic = true,
  showAlternatives = true,
  showLabels = false,
  pickMode = null,
  onPick,
  onRoadSelect,
  clock,
  compact = false,
  className,
  initialCenter = [400, 600],
  initialZoom = -1.25,
}: TrafficMapProps) {
  const [inspect, setInspect] = useState<Road | null>(null)
  const [activePanes, setActivePanes] = useState({ traffic: showTraffic, labels: showLabels, alternatives: showAlternatives })
  const mapRef = useRef<L.Map | null>(null)

  useEffect(() => {
    setActivePanes({ traffic: showTraffic, labels: showLabels, alternatives: showAlternatives })
  }, [showTraffic, showLabels, showAlternatives])

  const nodeById = useMemo(() => new Map(network.nodes.map((node) => [node.id, node])), [network.nodes])
  const originNode = origin ? nodeById.get(origin) : undefined
  const destinationNode = destination ? nodeById.get(destination) : undefined
  const sortedRoads = useMemo(
    () =>
      [...network.roads].sort((a, b) => {
        const order: Record<string, number> = { residential: 0, collector: 1, arterial: 2, highway: 3 }
        return (order[a.road_class] ?? 0) - (order[b.road_class] ?? 0)
      }),
    [network.roads],
  )
  const districts = useMemo(() => districtLabels(network), [network])
  const incidentsByRoad = useMemo(() => {
    const map = new Map<string, Incident[]>()
    for (const incident of incidents) {
      map.set(incident.road_id, [...(map.get(incident.road_id) ?? []), incident])
    }
    return map
  }, [incidents])
  const selectedRoute = routes.find((route) => route.route_id === selectedRouteId) ?? routes[0]
  const alternativeRoutes = activePanes.alternatives ? routes.filter((route) => route.route_id !== selectedRoute?.route_id) : []

  const originIcon = useMemo(
    () =>
      L.divIcon({
        className: '',
        html: '<div class="pin pin-origin">A</div>',
        iconSize: [26, 26],
        iconAnchor: [13, 13],
      }),
    [],
  )
  const destinationIcon = useMemo(
    () =>
      L.divIcon({
        className: '',
        html: '<div class="pin pin-destination">B</div>',
        iconSize: [26, 26],
        iconAnchor: [13, 13],
      }),
    [],
  )
  const incidentIcon = useMemo(
    () =>
      L.divIcon({
        className: '',
        html: '<div class="pin-incident">!</div>',
        iconSize: [18, 18],
        iconAnchor: [9, 9],
      }),
    [],
  )

  const gridLines = useMemo(() => {
    const lines: [number, number][][] = []
    for (let x = 100; x < MAP_W; x += 100) {
      lines.push([
        [0, x],
        [MAP_H, x],
      ])
    }
    for (let y = 100; y < MAP_H; y += 100) {
      lines.push([
        [y, 0],
        [y, MAP_W],
      ])
    }
    return lines
  }, [])

  return (
    <div className={cx('map-shell relative overflow-hidden rounded-xl border border-white/[0.07] bg-ink-900', className)}>
      <MapContainer
        ref={mapRef}
        center={initialCenter}
        zoom={initialZoom}
        minZoom={-2}
        maxZoom={2.2}
        zoomSnap={0.25}
        zoomDelta={0.5}
        wheelPxPerZoomLevel={100}
        crs={L.CRS.Simple}
        zoomControl={false}
        attributionControl={false}
        className="h-full w-full"
        preferCanvas
      >
        <FitBounds compact={compact} />
        <ClickCapture pickMode={pickMode} network={network} onPick={onPick} />
        <ZoomControl position="bottomright" />

        <Pane name="grid" style={{ zIndex: 170 }}>
          {gridLines.map((line, index) => (
            <Polyline
              key={`grid-${index}`}
              positions={line}
              pathOptions={{ color: '#173044', weight: 0.5, opacity: 0.45, interactive: false }}
            />
          ))}
          <Rectangle
            bounds={[
              [0, 0],
              [MAP_H, MAP_W],
            ]}
            pathOptions={{ color: '#1c3c52', weight: 1, fill: false, dashArray: '4 8', interactive: false }}
          />
        </Pane>

        <Pane name="districts" style={{ zIndex: 180 }}>
          {districts.map((district) => (
            <Marker
              key={district.label}
              position={point(district.x, district.y)}
              interactive={false}
              icon={L.divIcon({
                className: '',
                html: `<div class="district-label">${district.label}</div>`,
                iconSize: [100, 16],
                iconAnchor: [50, 8],
              })}
            />
          ))}
        </Pane>

        <Pane name="roads" style={{ zIndex: 300 }}>
          {sortedRoads.map((road) => {
            const a = nodeById.get(road.from)
            const b = nodeById.get(road.to)
            if (!a || !b) return null
            const color = activePanes.traffic ? roadColor(road) : road.status === 'closed' ? congestionColors.closed : '#3f677d'
            const weight = roadWeight(road)
            const opacity = road.status === 'closed' ? 0.95 : activePanes.traffic ? 0.72 : 0.45
            const hasIncident = (incidentsByRoad.get(road.id)?.length ?? 0) > 0
            return (
              <Polyline
                key={road.id}
                positions={[point(a.x, a.y), point(b.x, b.y)]}
                pathOptions={{
                  color,
                  weight,
                  opacity,
                  dashArray: road.status === 'closed' ? '5 5' : hasIncident ? '9 4' : undefined,
                  lineCap: 'round',
                  lineJoin: 'round',
                }}
                eventHandlers={{
                  click: (event) => {
                    L.DomEvent.stopPropagation(event.originalEvent)
                    setInspect(road)
                    onRoadSelect?.(road)
                  },
                }}
              >
                <Tooltip sticky className="flow-tooltip" direction="top" opacity={1}>
                  <div className="font-semibold text-ink-100">{road.name}</div>
                  <div className="mt-0.5 text-ink-400">
                    {road.from_name} ↔ {road.to_name}
                  </div>
                  <div className="mt-1 flex items-center gap-2">
                    <span className="mono" style={{ color }}>
                      {road.status === 'closed' ? 'CLOSED' : `${formatNumber(road.effective_speed_kph, 0)} km/h`}
                    </span>
                    <span className="text-ink-600">·</span>
                    <span>{titleCase(road.congestion_level)}</span>
                    {road.one_way !== 'two_way' && <span className="text-amber-400">One-way</span>}
                  </div>
                </Tooltip>
              </Polyline>
            )
          })}
        </Pane>

        <Pane name="alternatives" style={{ zIndex: 400 }}>
          {alternativeRoutes.map((route, index) => {
            const positions = route.path
              .map((id) => nodeById.get(id))
              .filter(Boolean)
              .map((node) => point(node!.x, node!.y))
            return (
              <Polyline
                key={route.route_id}
                positions={positions}
                pathOptions={{
                  color: routeColors[(index + 1) % routeColors.length],
                  weight: compact ? 3 : 4,
                  opacity: 0.72,
                  dashArray: '7 6',
                  lineCap: 'round',
                }}
                interactive={false}
              />
            )
          })}
        </Pane>

        <Pane name="selected-route" style={{ zIndex: 450 }}>
          {selectedRoute && (
            <>
              <Polyline
                positions={selectedRoute.path.map((id) => {
                  const node = nodeById.get(id)!
                  return point(node.x, node.y)
                })}
                pathOptions={{ color: '#43e0b0', weight: compact ? 9 : 12, opacity: 0.14, lineCap: 'round' }}
                interactive={false}
              />
              <Polyline
                positions={selectedRoute.path.map((id) => {
                  const node = nodeById.get(id)!
                  return point(node.x, node.y)
                })}
                pathOptions={{ color: '#43e0b0', weight: compact ? 4 : 5.5, opacity: 1, lineCap: 'round', lineJoin: 'round' }}
                interactive={false}
              />
            </>
          )}
        </Pane>

        <Pane name="nodes" style={{ zIndex: 480 }}>
          {network.nodes.map((node) => {
            const isOrigin = node.id === origin
            const isDestination = node.id === destination
            const highlight = pickMode !== null
            return (
              <CircleMarker
                key={node.id}
                center={point(node.x, node.y)}
                radius={isOrigin || isDestination ? 0 : highlight ? 4 : 3.2}
                pathOptions={{
                  color: highlight ? '#8fe7cf' : '#0b1721',
                  weight: 1.2,
                  fillColor: highlight ? '#43e0b0' : '#a8bdcb',
                  fillOpacity: highlight ? 0.9 : 0.62,
                }}
                eventHandlers={{
                  click: (event) => {
                    L.DomEvent.stopPropagation(event.originalEvent)
                    if (pickMode && onPick) onPick(node.id, pickMode)
                  },
                }}
              >
                <Tooltip direction="top" className="flow-tooltip" opacity={1}>
                  <div className="font-semibold">{node.name}</div>
                  <div className="text-ink-400">
                    {node.district} · {node.degree} connections
                  </div>
                  {pickMode && <div className="mt-1 text-signal-400">Click to set {pickMode}</div>}
                </Tooltip>
              </CircleMarker>
            )
          })}

          {originNode && (
            <Marker position={point(originNode.x, originNode.y)} icon={originIcon} zIndexOffset={1000} interactive={false} />
          )}
          {destinationNode && (
            <Marker position={point(destinationNode.x, destinationNode.y)} icon={destinationIcon} zIndexOffset={1000} />
          )}
          {network.nodes
            .filter((node) => activePanes.labels && !['origin', 'destination'].includes(node.kind))
            .map((node) => (
              <Marker
                key={`label-${node.id}`}
                position={point(node.x, node.y)}
                interactive={false}
                icon={L.divIcon({
                  className: '',
                  html: `<div class="node-label">${node.name}</div>`,
                  iconSize: [120, 14],
                  iconAnchor: [-5, 7],
                })}
              />
            ))}
        </Pane>

        <Pane name="incidents" style={{ zIndex: 490 }}>
          {incidents.map((incident) => {
            const road = network.roads.find((r) => r.id === incident.road_id)
            if (!road) return null
            const a = nodeById.get(road.from)
            const b = nodeById.get(road.to)
            if (!a || !b) return null
            const position = point((a.x + b.x) / 2, (a.y + b.y) / 2)
            return (
              <Marker key={incident.id} position={position} icon={incidentIcon} zIndexOffset={900}>
                <Tooltip direction="top" className="flow-tooltip" opacity={1}>
                  <div className="font-semibold">{incident.type_label}</div>
                  <div className="text-ink-400">{incident.road_name}</div>
                  <div className="mt-1 text-amber-300">
                    {titleCase(incident.severity)} severity · {incident.duration_min} min
                  </div>
                </Tooltip>
              </Marker>
            )
          })}
        </Pane>
      </MapContainer>

      {/* Overlay controls */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-[600] flex items-start justify-between gap-2 p-3">
        <div className="pointer-events-auto flex flex-col gap-2">
          <div className="flex items-center gap-2 rounded-lg border border-white/[0.09] bg-ink-950/85 px-2.5 py-1.5 backdrop-blur-md">
            <span className={cx('h-1.5 w-1.5 rounded-full', pickMode ? 'bg-amber-400 live-dot' : 'bg-signal-400')} />
            <span className="text-[9px] font-semibold uppercase tracking-[0.14em] text-ink-300">
              {pickMode ? `Pick ${pickMode}` : 'Synthetic road network'}
            </span>
            {clock && <span className="mono text-[9px] text-ink-500">· {clock}</span>}
          </div>
          {inspect && (
            <div className="max-w-[230px] rounded-lg border border-white/[0.1] bg-ink-950/92 p-2.5 backdrop-blur-md">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-semibold text-ink-100">{inspect.name}</span>
                <button
                  className="text-[10px] text-ink-500 hover:text-ink-200"
                  onClick={() => setInspect(null)}
                  aria-label="Close road details"
                >
                  ×
                </button>
              </div>
              <div className="mt-1 text-[9px] text-ink-400">
                {inspect.from_name} ↔ {inspect.to_name}
              </div>
              <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[9px]">
                <span className="text-ink-500">Speed</span>
                <span className="mono text-right text-ink-200">
                  {inspect.status === 'closed' ? 'Closed' : `${formatNumber(inspect.effective_speed_kph, 0)} km/h`}
                </span>
                <span className="text-ink-500">Congestion</span>
                <span className="mono text-right" style={{ color: roadColor(inspect) }}>
                  {formatNumber(inspect.congestion, 0)}%
                </span>
                <span className="text-ink-500">Utilization</span>
                <span className="mono text-right text-ink-200">{formatNumber(inspect.utilization, 0)}%</span>
                <span className="text-ink-500">Distance</span>
                <span className="mono text-right text-ink-200">{formatNumber(inspect.distance_km, 2)} km</span>
              </div>
            </div>
          )}
        </div>

        <div className="pointer-events-auto flex items-center gap-1 rounded-lg border border-white/[0.09] bg-ink-950/85 p-1 backdrop-blur-md">
          <button
            className={cx('grid h-7 w-7 place-items-center rounded-md transition-colors', activePanes.traffic ? 'bg-white/[0.09] text-signal-400' : 'text-ink-400 hover:text-ink-100')}
            onClick={() => setActivePanes((current) => ({ ...current, traffic: !current.traffic }))}
            title="Toggle traffic colours"
            aria-label="Toggle traffic colours"
          >
            <Layers3 size={13} />
          </button>
          <button
            className={cx('grid h-7 w-7 place-items-center rounded-md transition-colors', activePanes.alternatives ? 'bg-white/[0.09] text-amber-400' : 'text-ink-400 hover:text-ink-100')}
            onClick={() => setActivePanes((current) => ({ ...current, alternatives: !current.alternatives }))}
            title="Toggle alternative routes"
            aria-label="Toggle alternative routes"
          >
            <RouteIcon size={13} />
          </button>
          <button
            className={cx('grid h-7 w-7 place-items-center rounded-md transition-colors', activePanes.labels ? 'bg-white/[0.09] text-sky-300' : 'text-ink-400 hover:text-ink-100')}
            onClick={() => setActivePanes((current) => ({ ...current, labels: !current.labels }))}
            title="Toggle junction labels"
            aria-label="Toggle junction labels"
          >
            <Tags size={13} />
          </button>
          <span className="mx-0.5 h-4 w-px bg-white/[0.09]" />
          <button
            className="grid h-7 w-7 place-items-center rounded-md text-ink-400 transition-colors hover:text-ink-100"
            onClick={() => {
              mapRef.current?.fitBounds(
                [
                  [-20, -20],
                  [MAP_H + 20, MAP_W + 20],
                ],
                { padding: compact ? [10, 10] : [18, 18], animate: true },
              )
            }}
            title="Fit network"
            aria-label="Fit map"
          >
            <Maximize2 size={13} />
          </button>
        </div>
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[600] flex items-end justify-between gap-3 p-3">
        <div className="rounded-lg border border-white/[0.08] bg-ink-950/85 px-2.5 py-2 backdrop-blur-md">
          <div className="mb-1.5 text-[8px] font-semibold uppercase tracking-[0.16em] text-ink-500">Congestion</div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {(['free', 'moderate', 'heavy', 'severe'] as const).map((level) => (
              <span key={level} className="inline-flex items-center gap-1 text-[8px] capitalize text-ink-400">
                <span className="h-0.5 w-3 rounded" style={{ background: congestionColors[level] }} />
                {level}
              </span>
            ))}
            <span className="inline-flex items-center gap-1 text-[8px] text-ink-400">
              <span className="h-0.5 w-3 rounded border-t border-dashed border-coral-400" />
              closed
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {pickMode && (
            <Badge tone="amber" className="hidden bg-ink-950/85 backdrop-blur md:inline-flex">
              <Crosshair size={10} /> Junction snap enabled
            </Badge>
          )}
          <div className="hidden items-center gap-1.5 rounded-md border border-white/[0.08] bg-ink-950/85 px-2 py-1.5 backdrop-blur-md sm:flex">
            <MapPin size={10} className="text-signal-400" />
            <span className="text-[8px] uppercase tracking-[0.1em] text-ink-500">Simulated coordinates</span>
          </div>
        </div>
      </div>
    </div>
  )
}
