'use client';

import {
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Focus,
  Minus,
  Move,
  Plus,
  Route,
  Search,
  Tag,
  X,
} from 'lucide-react';
import React, {
  useCallback,
  useDeferredValue,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '@/components/ui/resizable';
import { cn } from '@/lib/utils';

import {
  HodoscopeProjection,
  HodoscopeProjectionPoint,
  HodoscopeTagCatalogEntry,
} from '../api/hodoscopeApi';
import { useLocale } from '../contexts/LocaleContext';
import { HodoscopeTrajectoryLayer } from './HodoscopeTrajectoryLayer';
import {
  buildTagLookup,
  getPointTags,
  getTagDisplayLabel,
  getTagScopeLabel,
  getTagSourceLabel,
  groupTagCatalog,
  type HodoscopeTagLabels,
  matchesHodoscopeSearch,
  matchesPointTagFilters,
} from './hodoscopeViewModel';

const VIEW_WIDTH = 1000;
const VIEW_PADDING = 56;
const DEFAULT_VIEW_HEIGHT = 620;
const MIN_ZOOM = 1;
const MAX_ZOOM = 8;
const MAX_TAG_POPOVER_RESULTS = 250;

type ColorMode = 'outcome' | 'group';
type Outcome = 'passed' | 'failed' | 'timeout' | 'exception' | 'unknown';

interface ViewTransform {
  x: number;
  y: number;
  scale: number;
}

interface ViewportDimensions {
  width: number;
  height: number;
}

interface TooltipPosition {
  x: number;
  y: number;
}

interface DragState {
  pointerId: number;
  startX: number;
  startY: number;
  originX: number;
  originY: number;
}

interface HodoscopeEmbeddingMapProps {
  projection: HodoscopeProjection;
  selectedPointId: string | null;
  onSelectedPointChange: (pointId: string | null) => void;
  onOpenPoint: (point: HodoscopeProjectionPoint) => void;
  layoutStorageKey: string;
}

const OUTCOME_ORDER: Outcome[] = [
  'passed',
  'failed',
  'timeout',
  'exception',
  'unknown',
];

const OUTCOME_COLORS: Record<Outcome, string> = {
  passed: 'hsl(var(--green-text))',
  failed: 'hsl(var(--red-text))',
  timeout: 'hsl(var(--orange-text))',
  exception: 'hsl(var(--purple-text))',
  unknown: 'hsl(var(--muted-foreground))',
};

const GROUP_COLORS = [
  'hsl(var(--blue-text))',
  'hsl(var(--green-text))',
  'hsl(var(--orange-text))',
  'hsl(var(--purple-text))',
  'hsl(var(--cyan-text))',
  'hsl(var(--red-text))',
  'hsl(var(--indigo-text))',
];

const DEFAULT_VIEW: ViewTransform = { x: 0, y: 0, scale: 1 };
const DEFAULT_VIEWPORT: ViewportDimensions = {
  width: VIEW_WIDTH,
  height: DEFAULT_VIEW_HEIGHT,
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function clampView(
  view: ViewTransform,
  viewport: ViewportDimensions
): ViewTransform {
  const scale = clamp(view.scale, MIN_ZOOM, MAX_ZOOM);
  if (scale === 1) {
    return DEFAULT_VIEW;
  }

  return {
    scale,
    x: clamp(view.x, viewport.width * (1 - scale), 0),
    y: clamp(view.y, viewport.height * (1 - scale), 0),
  };
}

function normalizeOutcome(point: HodoscopeProjectionPoint): Outcome {
  const outcome = point.outcome?.toLowerCase();
  if (outcome === 'passed' || outcome === 'success') return 'passed';
  if (outcome === 'failed' || outcome === 'failure') return 'failed';
  if (outcome === 'timeout') return 'timeout';
  if (outcome === 'exception' || outcome === 'error') return 'exception';

  if (point.exception_type === 'AgentTimeoutError') return 'timeout';
  if (point.exception_type) return 'exception';
  return 'unknown';
}

function pointCategory(point: HodoscopeProjectionPoint, mode: ColorMode) {
  return mode === 'group' ? point.group : normalizeOutcome(point);
}

function normalizeProjectionPoints(
  points: HodoscopeProjectionPoint[],
  viewport: ViewportDimensions
) {
  if (points.length === 0) {
    return new Map<string, { x: number; y: number }>();
  }

  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const spanX = maxX - minX;
  const spanY = maxY - minY;
  const centerX = minX + spanX / 2;
  const centerY = minY + spanY / 2;
  const padding = Math.min(VIEW_PADDING, viewport.height * 0.14);
  const plotWidth = viewport.width - padding * 2;
  const plotHeight = viewport.height - padding * 2;
  const scaleX = spanX > 0 ? plotWidth / spanX : Number.POSITIVE_INFINITY;
  const scaleY = spanY > 0 ? plotHeight / spanY : Number.POSITIVE_INFINITY;
  const coordinateScale = Math.min(scaleX, scaleY);
  const safeScale = Number.isFinite(coordinateScale) ? coordinateScale : 1;

  return new Map(
    points.map((point) => [
      point.id,
      {
        x: viewport.width / 2 + (point.x - centerX) * safeScale,
        y: viewport.height / 2 - (point.y - centerY) * safeScale,
      },
    ])
  );
}

function getGroupColor(group: string, groups: string[]) {
  const index = Math.max(0, groups.indexOf(group));
  return GROUP_COLORS[index % GROUP_COLORS.length];
}

function pointColor(
  point: HodoscopeProjectionPoint,
  mode: ColorMode,
  groupNames: string[]
) {
  return mode === 'outcome'
    ? OUTCOME_COLORS[normalizeOutcome(point)]
    : getGroupColor(point.group, groupNames);
}

function clientToSvgPoint(
  svg: SVGSVGElement,
  clientX: number,
  clientY: number,
  viewport: ViewportDimensions
) {
  const screenMatrix = svg.getScreenCTM();
  if (screenMatrix) {
    const point = new DOMPoint(clientX, clientY).matrixTransform(
      screenMatrix.inverse()
    );
    return { x: point.x, y: point.y };
  }

  const rect = svg.getBoundingClientRect();
  return {
    x: ((clientX - rect.left) / rect.width) * viewport.width,
    y: ((clientY - rect.top) / rect.height) * viewport.height,
  };
}

function outcomeBadgeClass(outcome: Outcome) {
  if (outcome === 'passed')
    return 'border-green-border bg-green-bg text-green-text';
  if (outcome === 'failed') return 'border-red-border bg-red-bg text-red-text';
  if (outcome === 'timeout')
    return 'border-orange-border bg-orange-bg text-orange-text';
  if (outcome === 'exception') {
    return 'border-purple-border bg-purple-bg text-purple-text';
  }
  return 'border-border bg-muted text-muted-foreground';
}

interface ProjectionMarksProps {
  points: HodoscopeProjectionPoint[];
  positions: Map<string, { x: number; y: number }>;
  selectedPointId: string | null;
  hoveredPointId: string | null;
  colorMode: ColorMode;
  groupNames: string[];
  scale: number;
  onPreview: (
    point: HodoscopeProjectionPoint,
    event: React.PointerEvent<SVGCircleElement>
  ) => void;
  onPreviewMove: (event: React.PointerEvent<SVGCircleElement>) => void;
  onPreviewEnd: () => void;
  onSelect: (point: HodoscopeProjectionPoint) => void;
  onOpen: (point: HodoscopeProjectionPoint) => void;
}

const ProjectionMarks = React.memo(function ProjectionMarks({
  points,
  positions,
  selectedPointId,
  hoveredPointId,
  colorMode,
  groupNames,
  scale,
  onPreview,
  onPreviewMove,
  onPreviewEnd,
  onSelect,
  onOpen,
}: ProjectionMarksProps) {
  return points.map((point) => {
    const position = positions.get(point.id);
    if (!position) return null;
    const isSelected = point.id === selectedPointId;
    const isHovered = point.id === hoveredPointId;
    const isRepresentative = point.fps_rank < 8;
    const color = pointColor(point, colorMode, groupNames);
    const radius = (isSelected ? 8 : isHovered ? 6.5 : 5) / scale;

    return (
      <g key={point.id}>
        {isRepresentative ? (
          <circle
            cx={position.x}
            cy={position.y}
            r={10 / scale}
            fill="none"
            stroke={color}
            strokeOpacity={isSelected ? 0.9 : 0.34}
            strokeWidth={1.5}
            vectorEffect="non-scaling-stroke"
            pointerEvents="none"
          />
        ) : null}
        {isSelected ? (
          <circle
            cx={position.x}
            cy={position.y}
            r={12 / scale}
            fill="hsl(var(--background))"
            fillOpacity="0.92"
            stroke="hsl(var(--foreground))"
            strokeWidth={2}
            vectorEffect="non-scaling-stroke"
            pointerEvents="none"
          />
        ) : null}
        <circle
          cx={position.x}
          cy={position.y}
          r={radius}
          fill={color}
          fillOpacity={isSelected || isHovered ? 1 : 0.76}
          stroke="hsl(var(--background))"
          strokeWidth={isSelected ? 2 : 1.25}
          vectorEffect="non-scaling-stroke"
          className="cursor-pointer transition-opacity motion-reduce:transition-none"
          onPointerDown={(event) => event.stopPropagation()}
          onPointerEnter={(event) => onPreview(point, event)}
          onPointerMove={onPreviewMove}
          onPointerLeave={onPreviewEnd}
          onClick={(event) => {
            event.stopPropagation();
            onSelect(point);
          }}
          onDoubleClick={(event) => {
            event.stopPropagation();
            onOpen(point);
          }}
        />
      </g>
    );
  });
});

export function HodoscopeEmbeddingMap({
  projection,
  selectedPointId,
  onSelectedPointChange,
  onOpenPoint,
  layoutStorageKey,
}: HodoscopeEmbeddingMapProps) {
  const { t } = useLocale();
  const shellRef = useRef<HTMLDivElement>(null);
  const plotRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const viewRef = useRef<ViewTransform>(DEFAULT_VIEW);
  const dragRef = useRef<DragState | null>(null);
  const selectionClearedRef = useRef(false);
  const svgId = useId().replaceAll(':', '');
  const gridId = `hodoscope-grid-${svgId}`;
  const clipId = `hodoscope-clip-${svgId}`;
  const [isWide, setIsWide] = useState(true);
  const [colorMode, setColorMode] = useState<ColorMode>('outcome');
  const [hiddenCategories, setHiddenCategories] = useState<Set<string>>(
    () => new Set()
  );
  const [selectedTagIds, setSelectedTagIds] = useState<Set<string>>(
    () => new Set()
  );
  const [query, setQuery] = useState('');
  const [tagQuery, setTagQuery] = useState('');
  const [showSelectedPath, setShowSelectedPath] = useState(true);
  const [hoveredPointId, setHoveredPointId] = useState<string | null>(null);
  const [tooltipPosition, setTooltipPosition] =
    useState<TooltipPosition | null>(null);
  const [view, setView] = useState<ViewTransform>(DEFAULT_VIEW);
  const [viewport, setViewport] =
    useState<ViewportDimensions>(DEFAULT_VIEWPORT);
  const [isPanning, setIsPanning] = useState(false);

  const groupNames = useMemo(
    () => projection.groups.map((group) => group.name),
    [projection.groups]
  );

  const normalizedPoints = useMemo(
    () => normalizeProjectionPoints(projection.points, viewport),
    [projection.points, viewport]
  );

  const pointById = useMemo(
    () => new Map(projection.points.map((point) => [point.id, point])),
    [projection.points]
  );

  const tagCatalog = useMemo(
    () => projection.tag_catalog ?? [],
    [projection.tag_catalog]
  );
  const tagLabels = useMemo<HodoscopeTagLabels>(
    () => ({
      sources: {
        metadata: t('analysis.hodoscope.tagSource.metadata'),
        rubric_cluster: t('analysis.hodoscope.tagSource.rubricCluster'),
        point_rubric: t('analysis.hodoscope.tagSource.pointRubric'),
        manual: t('analysis.hodoscope.tagSource.manual'),
      },
      pointScope: t('analysis.hodoscope.tagScope.point'),
      runInheritedScope: t('analysis.hodoscope.tagScope.runInherited'),
    }),
    [t]
  );
  const outcomeLabels = useMemo<Record<Outcome, string>>(
    () => ({
      passed: t('analysis.hodoscope.outcome.passed'),
      failed: t('analysis.hodoscope.outcome.failed'),
      timeout: t('analysis.hodoscope.outcome.timeout'),
      exception: t('analysis.hodoscope.outcome.exception'),
      unknown: t('analysis.hodoscope.outcome.unknown'),
    }),
    [t]
  );
  const tagById = useMemo(() => buildTagLookup(tagCatalog), [tagCatalog]);
  const normalizedTagQuery = tagQuery.trim().toLowerCase();
  const tagFacetGroups = useMemo(
    () => groupTagCatalog(tagCatalog, normalizedTagQuery, tagLabels),
    [normalizedTagQuery, tagCatalog, tagLabels]
  );
  const matchingTagCount = useMemo(
    () => tagFacetGroups.reduce((count, group) => count + group.tags.length, 0),
    [tagFacetGroups]
  );
  const visibleTagFacetGroups = useMemo(() => {
    let remaining = MAX_TAG_POPOVER_RESULTS;
    return tagFacetGroups
      .map((group) => {
        const visibleTags = group.tags.slice(0, remaining);
        remaining -= visibleTags.length;
        return { ...group, tags: visibleTags };
      })
      .filter((group) => group.tags.length > 0);
  }, [tagFacetGroups]);
  const selectedTags = useMemo(
    () =>
      Array.from(selectedTagIds)
        .map((tagId) => tagById.get(tagId))
        .filter((tag): tag is HodoscopeTagCatalogEntry => Boolean(tag))
        .sort((a, b) => {
          const facetOrder = a.facet.localeCompare(b.facet);
          return (
            facetOrder ||
            getTagDisplayLabel(a).localeCompare(getTagDisplayLabel(b))
          );
        }),
    [selectedTagIds, tagById]
  );

  const categoryEntries = useMemo(() => {
    if (colorMode === 'group') {
      return projection.groups.map((group) => ({
        key: group.name,
        label: group.name,
        count: group.count,
        color: getGroupColor(group.name, groupNames),
      }));
    }

    const counts = new Map<Outcome, number>(
      OUTCOME_ORDER.map((outcome) => [outcome, 0])
    );
    projection.points.forEach((point) => {
      const outcome = normalizeOutcome(point);
      counts.set(outcome, (counts.get(outcome) ?? 0) + 1);
    });
    return OUTCOME_ORDER.filter(
      (outcome) => (counts.get(outcome) ?? 0) > 0
    ).map((outcome) => ({
      key: outcome,
      label: outcomeLabels[outcome],
      count: counts.get(outcome) ?? 0,
      color: OUTCOME_COLORS[outcome],
    }));
  }, [
    colorMode,
    groupNames,
    outcomeLabels,
    projection.groups,
    projection.points,
  ]);

  const deferredQuery = useDeferredValue(query);
  const normalizedQuery = deferredQuery.trim().toLowerCase();
  const searchIsPending = query !== deferredQuery;
  const visiblePoints = useMemo(
    () =>
      projection.points.filter(
        (point) =>
          !hiddenCategories.has(pointCategory(point, colorMode)) &&
          matchesPointTagFilters(point, selectedTagIds, tagById) &&
          matchesHodoscopeSearch(point, normalizedQuery, tagById, tagLabels)
      ),
    [
      colorMode,
      hiddenCategories,
      normalizedQuery,
      projection.points,
      selectedTagIds,
      tagById,
      tagLabels,
    ]
  );

  const selectedPoint = selectedPointId
    ? (pointById.get(selectedPointId) ?? null)
    : null;
  const selectedVisibleIndex = selectedPointId
    ? visiblePoints.findIndex((point) => point.id === selectedPointId)
    : -1;

  const hoveredPoint = hoveredPointId
    ? (pointById.get(hoveredPointId) ?? null)
    : null;
  const hoveredPointTags = hoveredPoint
    ? getPointTags(hoveredPoint, tagById)
    : [];

  const trajectoryPathById = useMemo(
    () =>
      new Map(
        (projection.trajectory_paths ?? []).map((path) => [
          path.trajectory_id,
          path,
        ])
      ),
    [projection.trajectory_paths]
  );
  const selectedTrajectoryPath = selectedPoint
    ? (trajectoryPathById.get(selectedPoint.trajectory_id) ?? null)
    : null;
  const selectedPathPointIds = useMemo(
    () =>
      selectedTrajectoryPath?.point_ids.filter((pointId) =>
        pointById.has(pointId)
      ) ?? [],
    [pointById, selectedTrajectoryPath]
  );
  const selectedPathStepIndex = selectedPointId
    ? selectedPathPointIds.indexOf(selectedPointId)
    : -1;
  const selectedPointTags = selectedPoint
    ? getPointTags(selectedPoint, tagById)
    : [];
  const selectedPointScopedTags = selectedPointTags.filter(
    (tag) => tag.scope === 'point' && !tag.inherited
  );
  const selectedRunTags = selectedPointTags.filter(
    (tag) => tag.scope === 'trajectory' || tag.inherited
  );

  const representatives = useMemo(
    () =>
      [...visiblePoints].sort((a, b) => a.fps_rank - b.fps_rank).slice(0, 8),
    [visiblePoints]
  );

  useEffect(() => {
    viewRef.current = view;
  }, [view]);

  useEffect(() => {
    const node = shellRef.current;
    if (!node || typeof ResizeObserver === 'undefined') return;

    const updateWidthMode = (width: number) => setIsWide(width >= 560);
    updateWidthMode(node.getBoundingClientRect().width);
    const observer = new ResizeObserver(([entry]) => {
      updateWidthMode(entry.contentRect.width);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const node = plotRef.current;
    if (!node || typeof ResizeObserver === 'undefined') return;

    let frameId: number | null = null;
    const updateViewport = (width: number, height: number) => {
      if (width < 1 || height < 1) return;
      if (frameId !== null) window.cancelAnimationFrame(frameId);
      frameId = window.requestAnimationFrame(() => {
        const nextViewport = {
          width: VIEW_WIDTH,
          height: clamp(VIEW_WIDTH / (width / height), 180, 1000),
        };
        setViewport((current) =>
          Math.abs(current.height - nextViewport.height) < 1
            ? current
            : nextViewport
        );
      });
    };

    const rect = node.getBoundingClientRect();
    updateViewport(rect.width, rect.height);
    const observer = new ResizeObserver(([entry]) => {
      updateViewport(entry.contentRect.width, entry.contentRect.height);
    });
    observer.observe(node);
    return () => {
      observer.disconnect();
      if (frameId !== null) window.cancelAnimationFrame(frameId);
    };
  }, [isWide]);

  useEffect(() => {
    setView((current) => {
      const nextView = clampView(current, viewport);
      viewRef.current = nextView;
      return nextView;
    });
  }, [viewport]);

  useEffect(() => {
    viewRef.current = DEFAULT_VIEW;
    setView(DEFAULT_VIEW);
    setHoveredPointId(null);
    setTooltipPosition(null);
    setHiddenCategories(new Set());
    setSelectedTagIds(new Set());
    setQuery('');
    setTagQuery('');
    setShowSelectedPath(true);
    selectionClearedRef.current = false;
  }, [projection.created_at]);

  useEffect(() => {
    setSelectedTagIds((current) => {
      const next = new Set(
        Array.from(current).filter((tagId) => tagById.has(tagId))
      );
      return next.size === current.size ? current : next;
    });
  }, [tagById]);

  useEffect(() => {
    if (visiblePoints.some((point) => point.id === selectedPointId)) return;

    if (visiblePoints.length === 0) {
      if (selectedPointId !== null) onSelectedPointChange(null);
      return;
    }

    if (!selectionClearedRef.current) {
      const representative = [...visiblePoints].sort(
        (a, b) => a.fps_rank - b.fps_rank
      )[0];
      onSelectedPointChange(representative.id);
    }
  }, [onSelectedPointChange, selectedPointId, visiblePoints]);

  const zoomAt = useCallback(
    (
      requestedScale: number,
      anchor = { x: viewport.width / 2, y: viewport.height / 2 }
    ) => {
      setView((current) => {
        const nextScale = clamp(requestedScale, MIN_ZOOM, MAX_ZOOM);
        const ratio = nextScale / current.scale;
        const nextView = clampView(
          {
            scale: nextScale,
            x: anchor.x - (anchor.x - current.x) * ratio,
            y: anchor.y - (anchor.y - current.y) * ratio,
          },
          viewport
        );
        viewRef.current = nextView;
        return nextView;
      });
    },
    [viewport]
  );

  const resetView = useCallback(() => {
    viewRef.current = DEFAULT_VIEW;
    setView(DEFAULT_VIEW);
  }, []);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;

    let frameId: number | null = null;
    let pendingFactor = 1;
    let pendingAnchor = {
      x: viewport.width / 2,
      y: viewport.height / 2,
    };

    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      pendingAnchor = clientToSvgPoint(
        svg,
        event.clientX,
        event.clientY,
        viewport
      );
      pendingFactor *= Math.exp(-event.deltaY * 0.0015);
      if (frameId !== null) return;

      frameId = window.requestAnimationFrame(() => {
        zoomAt(viewRef.current.scale * pendingFactor, pendingAnchor);
        pendingFactor = 1;
        frameId = null;
      });
    };

    svg.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      svg.removeEventListener('wheel', handleWheel);
      if (frameId !== null) window.cancelAnimationFrame(frameId);
    };
  }, [isWide, viewport, zoomAt]);

  const updateTooltip = useCallback(
    (event: React.PointerEvent<SVGCircleElement>) => {
      const svg = svgRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      setTooltipPosition({
        x: clamp(
          event.clientX - rect.left + 14,
          10,
          Math.max(10, rect.width - 270)
        ),
        y: clamp(
          event.clientY - rect.top + 14,
          10,
          Math.max(10, rect.height - 110)
        ),
      });
    },
    []
  );

  const handlePointerDown = (event: React.PointerEvent<SVGSVGElement>) => {
    if (event.button !== 0) return;
    const point = clientToSvgPoint(
      event.currentTarget,
      event.clientX,
      event.clientY,
      viewport
    );
    dragRef.current = {
      pointerId: event.pointerId,
      startX: point.x,
      startY: point.y,
      originX: viewRef.current.x,
      originY: viewRef.current.y,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    setIsPanning(true);
  };

  const handlePointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const point = clientToSvgPoint(
      event.currentTarget,
      event.clientX,
      event.clientY,
      viewport
    );
    const nextView = clampView(
      {
        ...viewRef.current,
        x: drag.originX + point.x - drag.startX,
        y: drag.originY + point.y - drag.startY,
      },
      viewport
    );
    viewRef.current = nextView;
    setView(nextView);
  };

  const finishPan = (event: React.PointerEvent<SVGSVGElement>) => {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setIsPanning(false);
  };

  const moveSelection = (delta: number) => {
    if (visiblePoints.length === 0) return;
    const currentIndex = visiblePoints.findIndex(
      (point) => point.id === selectedPointId
    );
    const nextIndex =
      currentIndex === -1
        ? 0
        : (currentIndex + delta + visiblePoints.length) % visiblePoints.length;
    selectionClearedRef.current = false;
    onSelectedPointChange(visiblePoints[nextIndex].id);
  };

  const moveInspectorSelection = (delta: number) => {
    if (selectedPathPointIds.length === 0) {
      moveSelection(delta);
      return;
    }

    const currentIndex = selectedPointId
      ? selectedPathPointIds.indexOf(selectedPointId)
      : -1;
    const nextIndex =
      currentIndex === -1
        ? 0
        : (currentIndex + delta + selectedPathPointIds.length) %
          selectedPathPointIds.length;
    selectionClearedRef.current = false;
    onSelectedPointChange(selectedPathPointIds[nextIndex]);
  };

  const handleMapKeyDown = (event: React.KeyboardEvent<SVGSVGElement>) => {
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      event.preventDefault();
      moveSelection(1);
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      event.preventDefault();
      moveSelection(-1);
    } else if (event.key === 'Enter' && selectedPoint) {
      event.preventDefault();
      onOpenPoint(selectedPoint);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      selectionClearedRef.current = true;
      onSelectedPointChange(null);
    } else if (event.key === '0') {
      event.preventDefault();
      resetView();
    }
  };

  const toggleCategory = (category: string) => {
    setHiddenCategories((current) => {
      const next = new Set(current);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  };

  const selectColorMode = (mode: ColorMode) => {
    setColorMode(mode);
    setHiddenCategories(new Set());
  };

  const toggleTagFilter = (tagId: string) => {
    setSelectedTagIds((current) => {
      const next = new Set(current);
      if (next.has(tagId)) next.delete(tagId);
      else next.add(tagId);
      return next;
    });
  };

  const clearTagFilters = () => setSelectedTagIds(new Set());

  const previewPoint = useCallback(
    (
      point: HodoscopeProjectionPoint,
      event: React.PointerEvent<SVGCircleElement>
    ) => {
      setHoveredPointId(point.id);
      updateTooltip(event);
    },
    [updateTooltip]
  );

  const endPreview = useCallback(() => {
    setHoveredPointId(null);
    setTooltipPosition(null);
  }, []);

  const selectPoint = useCallback(
    (point: HodoscopeProjectionPoint) => {
      selectionClearedRef.current = false;
      onSelectedPointChange(point.id);
    },
    [onSelectedPointChange]
  );

  const openPoint = useCallback(
    (point: HodoscopeProjectionPoint) => onOpenPoint(point),
    [onOpenPoint]
  );

  const selectedPathCoverage = selectedTrajectoryPath
    ? selectedTrajectoryPath.total_action_count === null
      ? t('analysis.hodoscope.path.coverageUnknownTotal', {
          projected: selectedTrajectoryPath.projected_point_count,
        })
      : t('analysis.hodoscope.path.coverageKnown', {
          projected: selectedTrajectoryPath.projected_point_count,
          total: selectedTrajectoryPath.total_action_count,
        })
    : null;
  const selectedPathNotice = selectedTrajectoryPath
    ? selectedTrajectoryPath.complete === true
      ? t('analysis.hodoscope.path.completeNotice')
      : selectedTrajectoryPath.complete === false
        ? t('analysis.hodoscope.path.sampledNotice')
        : t('analysis.hodoscope.path.unknownNotice')
    : null;
  const selectedPathA11yDescription =
    showSelectedPath && selectedTrajectoryPath && selectedPathCoverage
      ? t('analysis.hodoscope.path.a11yDescription', {
          coverage: selectedPathCoverage,
        })
      : null;

  const mapPanel = (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div
        className={cn(
          'flex items-center gap-2 border-b border-border/70 px-3 py-2',
          isWide ? 'flex-wrap' : 'flex-nowrap overflow-x-auto'
        )}
      >
        <div
          className={cn(
            'relative flex-1',
            isWide ? 'min-w-48 sm:max-w-72' : 'min-w-0'
          )}
        >
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('analysis.hodoscope.search.placeholder')}
            aria-label={t('analysis.hodoscope.search.aria')}
            className="h-8 border-border/70 bg-muted/30 pl-8 text-xs"
          />
        </div>

        <div
          className="flex rounded-md border border-border/70 bg-muted/30 p-0.5"
          role="group"
          aria-label={t('analysis.hodoscope.colorBy')}
        >
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className={cn(
              'h-7 px-2.5 text-xs',
              colorMode === 'outcome' && 'bg-background shadow-sm'
            )}
            aria-pressed={colorMode === 'outcome'}
            onClick={() => selectColorMode('outcome')}
          >
            {t('analysis.hodoscope.color.outcome')}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className={cn(
              'h-7 px-2.5 text-xs',
              colorMode === 'group' && 'bg-background shadow-sm'
            )}
            aria-pressed={colorMode === 'group'}
            onClick={() => selectColorMode('group')}
          >
            {t('analysis.hodoscope.color.group')}
          </Button>
        </div>

        <Popover>
          <PopoverTrigger asChild>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 shrink-0 gap-1.5 px-2.5 text-xs"
              aria-label={
                selectedTagIds.size
                  ? t('analysis.hodoscope.tags.filterButtonActive', {
                      count: selectedTagIds.size,
                    })
                  : t('analysis.hodoscope.tags.filterButton')
              }
              disabled={tagCatalog.length === 0}
            >
              <Tag className="h-3.5 w-3.5" />
              <span className={cn(!isWide && 'sr-only')}>
                {t('analysis.hodoscope.tags.label')}
              </span>
              {selectedTagIds.size > 0 ? (
                <span className="rounded-full bg-blue-bg px-1.5 text-[10px] font-semibold text-blue-text">
                  {selectedTagIds.size}
                </span>
              ) : null}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-80 p-0">
            <div className="border-b border-border/70 p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <div>
                  <div className="text-xs font-semibold">
                    {t('analysis.hodoscope.tags.filterTitle')}
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    {t('analysis.hodoscope.tags.filterLogic')}
                  </div>
                </div>
                {selectedTagIds.size > 0 ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-[11px]"
                    onClick={clearTagFilters}
                  >
                    {t('analysis.hodoscope.tags.clear')}
                  </Button>
                ) : null}
              </div>
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="search"
                  value={tagQuery}
                  onChange={(event) => setTagQuery(event.target.value)}
                  placeholder={t('analysis.hodoscope.tags.searchPlaceholder')}
                  aria-label={t('analysis.hodoscope.tags.searchAria')}
                  className="h-8 pl-8 text-xs"
                />
              </div>
            </div>
            <div className="max-h-72 overflow-y-auto p-2 custom-scrollbar">
              {visibleTagFacetGroups.length > 0 ? (
                <div className="space-y-3">
                  {visibleTagFacetGroups.map((group) => (
                    <section
                      key={group.facet}
                      aria-label={getTagSourceLabel(group.tags[0], tagLabels)}
                    >
                      <div className="mb-1 px-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                        {getTagSourceLabel(group.tags[0], tagLabels)}
                      </div>
                      <div className="space-y-0.5">
                        {group.tags.map((tag) => (
                          <label
                            key={tag.id}
                            className="flex cursor-pointer items-start gap-2 rounded-md px-1.5 py-1.5 hover:bg-muted/60"
                            title={`${getTagScopeLabel(tag, tagLabels)} · ${getTagSourceLabel(tag, tagLabels)}`}
                          >
                            <Checkbox
                              checked={selectedTagIds.has(tag.id)}
                              onCheckedChange={() => toggleTagFilter(tag.id)}
                              aria-label={t(
                                'analysis.hodoscope.tags.filterBy',
                                {
                                  source: getTagSourceLabel(tag, tagLabels),
                                  label: getTagDisplayLabel(tag),
                                }
                              )}
                              className="mt-0.5"
                            />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-xs font-medium">
                                {getTagDisplayLabel(tag)}
                              </span>
                              <span className="block truncate text-[10px] text-muted-foreground">
                                {getTagScopeLabel(tag, tagLabels)} ·{' '}
                                {getTagSourceLabel(tag, tagLabels)}
                              </span>
                            </span>
                            <span className="text-[10px] tabular-nums text-muted-foreground">
                              {tag.count}
                            </span>
                          </label>
                        ))}
                      </div>
                    </section>
                  ))}
                  {matchingTagCount > MAX_TAG_POPOVER_RESULTS ? (
                    <p className="px-1 text-[10px] leading-relaxed text-muted-foreground">
                      {t('analysis.hodoscope.tags.resultLimit', {
                        limit: MAX_TAG_POPOVER_RESULTS,
                        count: matchingTagCount,
                      })}
                    </p>
                  ) : null}
                </div>
              ) : (
                <div className="px-3 py-8 text-center text-xs text-muted-foreground">
                  {t('analysis.hodoscope.tags.noMatches')}
                </div>
              )}
            </div>
          </PopoverContent>
        </Popover>

        <Button
          type="button"
          size="sm"
          variant={showSelectedPath ? 'secondary' : 'outline'}
          className="h-8 shrink-0 gap-1.5 px-2.5 text-xs"
          aria-label={
            showSelectedPath
              ? t('analysis.hodoscope.path.hideSelected')
              : t('analysis.hodoscope.path.showSelected')
          }
          aria-pressed={showSelectedPath}
          disabled={!selectedTrajectoryPath}
          title={
            selectedTrajectoryPath
              ? showSelectedPath
                ? t('analysis.hodoscope.path.hideSelected')
                : t('analysis.hodoscope.path.showSelected')
              : t('analysis.hodoscope.path.selectActionWithData')
          }
          onClick={() => setShowSelectedPath((current) => !current)}
        >
          <Route className="h-3.5 w-3.5" />
          <span className={cn(!isWide && 'sr-only')}>
            {t('analysis.hodoscope.path.toolbarLabel')}
          </span>
        </Button>

        {isWide ? (
          <>
            <div className="flex items-center rounded-md border border-border/70 bg-background shadow-sm">
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-7 w-7 rounded-r-none"
                aria-label={t('analysis.hodoscope.map.zoomOut')}
                onClick={() => zoomAt(view.scale / 1.35)}
                disabled={view.scale <= MIN_ZOOM}
              >
                <Minus className="h-3.5 w-3.5" />
              </Button>
              <span className="min-w-11 border-x border-border/70 px-1 text-center text-[11px] tabular-nums text-muted-foreground">
                {Math.round(view.scale * 100)}%
              </span>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-7 w-7 rounded-l-none"
                aria-label={t('analysis.hodoscope.map.zoomIn')}
                onClick={() => zoomAt(view.scale * 1.35)}
                disabled={view.scale >= MAX_ZOOM}
              >
                <Plus className="h-3.5 w-3.5" />
              </Button>
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 gap-1.5 px-2.5 text-xs"
              onClick={resetView}
            >
              <Focus className="h-3.5 w-3.5" />
              {t('analysis.hodoscope.map.fit')}
            </Button>
          </>
        ) : null}
      </div>

      {selectedTags.length > 0 ? (
        <div className="flex min-h-9 items-center gap-1.5 overflow-x-auto border-b border-border/60 bg-blue-bg/20 px-3 py-1.5">
          <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            {t('analysis.hodoscope.tags.activeFilters')}
          </span>
          {selectedTags.map((tag) => (
            <button
              key={tag.id}
              type="button"
              className="inline-flex h-6 max-w-56 shrink-0 items-center gap-1 rounded-full border border-blue-border bg-background px-2 text-[10px] text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label={t('analysis.hodoscope.tags.removeFilter', {
                source: getTagSourceLabel(tag, tagLabels),
                label: getTagDisplayLabel(tag),
              })}
              title={`${getTagScopeLabel(tag, tagLabels)} · ${getTagSourceLabel(tag, tagLabels)}`}
              onClick={() => toggleTagFilter(tag.id)}
            >
              <span className="truncate">
                {t('analysis.hodoscope.tags.sourceAndLabel', {
                  source: getTagSourceLabel(tag, tagLabels),
                  label: getTagDisplayLabel(tag),
                })}
              </span>
              <X className="h-3 w-3 shrink-0" aria-hidden="true" />
            </button>
          ))}
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-6 shrink-0 px-2 text-[10px]"
            onClick={clearTagFilters}
          >
            {t('analysis.hodoscope.tags.clearAll')}
          </Button>
        </div>
      ) : null}

      <div
        className={cn(
          'flex min-h-9 items-center gap-1.5 border-b border-border/60 px-3 py-1.5',
          isWide ? 'flex-wrap' : 'flex-nowrap overflow-x-auto'
        )}
      >
        {categoryEntries.map((category) => {
          const isVisible = !hiddenCategories.has(category.key);
          return (
            <button
              key={category.key}
              type="button"
              aria-pressed={isVisible}
              className={cn(
                'inline-flex h-7 max-w-52 shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-[11px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                isVisible
                  ? 'border-border bg-background text-foreground shadow-sm'
                  : 'border-transparent bg-muted/40 text-muted-foreground opacity-55'
              )}
              onClick={() => toggleCategory(category.key)}
              title={t(
                isVisible
                  ? 'analysis.hodoscope.map.hideCategory'
                  : 'analysis.hodoscope.map.showCategory',
                { category: category.label }
              )}
            >
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: category.color }}
              />
              <span className="truncate">{category.label}</span>
              <span className="tabular-nums text-muted-foreground">
                {category.count}
              </span>
            </button>
          );
        })}
        <span className="ml-auto shrink-0 text-[11px] tabular-nums text-muted-foreground">
          {searchIsPending
            ? t('analysis.hodoscope.map.updating')
            : t('analysis.hodoscope.map.visibleCount', {
                visible: visiblePoints.length,
                total: projection.points.length,
              })}
        </span>
      </div>

      <div
        ref={plotRef}
        className="relative min-h-48 flex-1 overflow-hidden bg-muted/10"
        aria-busy={searchIsPending}
      >
        <svg
          ref={svgRef}
          className={cn(
            'h-full min-h-48 w-full touch-none select-none outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-text',
            isPanning ? 'cursor-grabbing' : 'cursor-grab'
          )}
          role="img"
          tabIndex={0}
          aria-label={[
            t('analysis.hodoscope.map.ariaLabel', {
              method: projection.projection_method.toUpperCase(),
              count: visiblePoints.length,
            }),
            selectedPathA11yDescription,
          ]
            .filter(Boolean)
            .join(' ')}
          aria-describedby={`${svgId}-selection-status`}
          viewBox={`0 0 ${viewport.width} ${viewport.height}`}
          preserveAspectRatio="xMidYMid meet"
          onKeyDown={handleMapKeyDown}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={finishPan}
          onPointerCancel={finishPan}
        >
          <defs>
            <pattern
              id={gridId}
              width="50"
              height="50"
              patternUnits="userSpaceOnUse"
            >
              <path
                d="M 50 0 L 0 0 0 50"
                fill="none"
                stroke="hsl(var(--border))"
                strokeOpacity="0.42"
                strokeWidth="1"
                shapeRendering="crispEdges"
              />
            </pattern>
            <clipPath id={clipId}>
              <rect width={viewport.width} height={viewport.height} rx="18" />
            </clipPath>
          </defs>
          <rect
            width={viewport.width}
            height={viewport.height}
            fill={`url(#${gridId})`}
          />
          <g
            clipPath={`url(#${clipId})`}
            transform={`translate(${view.x} ${view.y}) scale(${view.scale})`}
          >
            {showSelectedPath && selectedTrajectoryPath ? (
              <HodoscopeTrajectoryLayer
                path={selectedTrajectoryPath}
                positions={normalizedPoints}
                scale={view.scale}
              />
            ) : null}
            <ProjectionMarks
              points={visiblePoints}
              positions={normalizedPoints}
              selectedPointId={selectedPointId}
              hoveredPointId={hoveredPointId}
              colorMode={colorMode}
              groupNames={groupNames}
              scale={view.scale}
              onPreview={previewPoint}
              onPreviewMove={updateTooltip}
              onPreviewEnd={endPreview}
              onSelect={selectPoint}
              onOpen={openPoint}
            />
          </g>
        </svg>

        <div
          id={`${svgId}-selection-status`}
          className="sr-only"
          aria-live="polite"
          aria-atomic="true"
        >
          {[
            selectedPoint
              ? selectedVisibleIndex >= 0
                ? t('analysis.hodoscope.map.selectedAction', {
                    index: selectedVisibleIndex + 1,
                    count: visiblePoints.length,
                    summary: selectedPoint.summary,
                  })
                : t('analysis.hodoscope.map.hiddenSelectedAction', {
                    summary: selectedPoint.summary,
                    count: visiblePoints.length,
                  })
              : t('analysis.hodoscope.map.noActionSelected', {
                  count: visiblePoints.length,
                }),
            selectedPathA11yDescription,
          ]
            .filter(Boolean)
            .join(' ')}
        </div>

        {!isWide ? (
          <div className="absolute right-2 top-2 z-10 flex items-center rounded-md border border-border/70 bg-background/90 shadow-sm backdrop-blur">
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-7 w-7 rounded-r-none"
              aria-label={t('analysis.hodoscope.map.zoomOut')}
              onClick={() => zoomAt(view.scale / 1.35)}
              disabled={view.scale <= MIN_ZOOM}
            >
              <Minus className="h-3.5 w-3.5" />
            </Button>
            <span className="min-w-10 border-x border-border/70 px-1 text-center text-[10px] tabular-nums text-muted-foreground">
              {Math.round(view.scale * 100)}%
            </span>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-7 w-7 rounded-none"
              aria-label={t('analysis.hodoscope.map.zoomIn')}
              onClick={() => zoomAt(view.scale * 1.35)}
              disabled={view.scale >= MAX_ZOOM}
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-7 w-7 rounded-l-none"
              aria-label={t('analysis.hodoscope.map.fitEmbedding')}
              onClick={resetView}
            >
              <Focus className="h-3.5 w-3.5" />
            </Button>
          </div>
        ) : null}

        {hoveredPoint && tooltipPosition ? (
          <div
            role="tooltip"
            className="pointer-events-none absolute z-20 w-64 rounded-lg border border-border/80 bg-popover/95 p-2.5 text-xs text-popover-foreground shadow-lg backdrop-blur"
            style={{ left: tooltipPosition.x, top: tooltipPosition.y }}
          >
            <div className="mb-1 flex items-center gap-1.5">
              <span
                className="h-2 w-2 rounded-full"
                style={{
                  backgroundColor: pointColor(
                    hoveredPoint,
                    colorMode,
                    groupNames
                  ),
                }}
              />
              <span className="truncate font-medium">{hoveredPoint.group}</span>
            </div>
            <p className="line-clamp-3 leading-relaxed text-muted-foreground">
              {hoveredPoint.summary}
            </p>
            {hoveredPointTags.length > 0 ? (
              <div className="mt-2 flex flex-wrap gap-1">
                {hoveredPointTags.slice(0, 3).map((tag) => (
                  <Badge
                    key={tag.id}
                    variant="secondary"
                    className="max-w-48 truncate text-[9px] font-normal"
                  >
                    {getTagDisplayLabel(tag)}
                  </Badge>
                ))}
                {hoveredPointTags.length > 3 ? (
                  <span className="text-[9px] text-muted-foreground">
                    +{hoveredPointTags.length - 3}
                  </span>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}

        <div
          className={cn(
            'pointer-events-none absolute bottom-2.5 left-3 items-center gap-1.5 rounded-md border border-border/60 bg-background/85 px-2 py-1 text-[10px] text-muted-foreground shadow-sm backdrop-blur',
            isWide ? 'flex' : 'hidden'
          )}
        >
          <Move className="h-3 w-3" />
          {t('analysis.hodoscope.map.panZoomHelp')}
        </div>
      </div>
    </div>
  );

  const inspectorPanel = (
    <aside className="flex h-full min-h-0 flex-col bg-card">
      <div className="flex items-center justify-between border-b border-border/70 px-3 py-2.5">
        <div>
          <div className="text-xs font-semibold">
            {t('analysis.hodoscope.inspector.title')}
          </div>
          <div className="text-[11px] text-muted-foreground">
            {t('analysis.hodoscope.inspector.subtitle')}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            aria-label={
              selectedPathPointIds.length > 0
                ? t('analysis.hodoscope.inspector.previousPathAction')
                : t('analysis.hodoscope.inspector.previousVisibleAction')
            }
            onClick={() => moveInspectorSelection(-1)}
            disabled={
              selectedPathPointIds.length > 0
                ? selectedPathPointIds.length < 2
                : visiblePoints.length === 0
            }
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            aria-label={
              selectedPathPointIds.length > 0
                ? t('analysis.hodoscope.inspector.nextPathAction')
                : t('analysis.hodoscope.inspector.nextVisibleAction')
            }
            onClick={() => moveInspectorSelection(1)}
            disabled={
              selectedPathPointIds.length > 0
                ? selectedPathPointIds.length < 2
                : visiblePoints.length === 0
            }
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3 custom-scrollbar">
        {selectedPoint ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-1.5">
                <Badge
                  variant="outline"
                  className={cn(
                    'font-normal',
                    outcomeBadgeClass(normalizeOutcome(selectedPoint))
                  )}
                >
                  {outcomeLabels[normalizeOutcome(selectedPoint)]}
                </Badge>
                <Badge variant="secondary" className="max-w-full truncate">
                  {selectedPoint.group}
                </Badge>
                <span className="ml-auto text-[11px] tabular-nums text-muted-foreground">
                  {t('analysis.hodoscope.representatives.fpsRank', {
                    rank: selectedPoint.fps_rank,
                  })}
                </span>
              </div>
              <h3 className="text-sm font-semibold leading-snug">
                {selectedPoint.summary}
              </h3>
              {selectedPoint.context_excerpt ? (
                <p className="whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">
                  {selectedPoint.context_excerpt}
                </p>
              ) : null}
            </div>

            {tagCatalog.length > 0 ? (
              <section
                className="space-y-2"
                aria-label={t('analysis.hodoscope.tags.actionTags')}
              >
                <div className="flex items-center justify-between">
                  <div className="text-xs font-semibold">
                    {t('analysis.hodoscope.tags.label')}
                  </div>
                  <div className="text-[10px] tabular-nums text-muted-foreground">
                    {t('analysis.hodoscope.tags.attachedCount', {
                      count: selectedPointTags.length,
                    })}
                  </div>
                </div>

                {selectedPointScopedTags.length > 0 ? (
                  <div className="space-y-1.5">
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {t('analysis.hodoscope.tags.pointTags')}
                    </div>
                    <div className="space-y-1">
                      {selectedPointScopedTags.map((tag) => (
                        <div
                          key={tag.id}
                          className="rounded-md border border-border/70 bg-background px-2 py-1.5"
                          title={`${getTagScopeLabel(tag, tagLabels)} · ${getTagSourceLabel(tag, tagLabels)}`}
                        >
                          <Badge
                            variant="secondary"
                            className="max-w-full font-normal"
                          >
                            <span className="truncate">
                              {getTagDisplayLabel(tag)}
                            </span>
                          </Badge>
                          <div className="mt-1 text-[10px] text-muted-foreground">
                            {getTagScopeLabel(tag, tagLabels)} ·{' '}
                            {getTagSourceLabel(tag, tagLabels)}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                {selectedRunTags.length > 0 ? (
                  <div className="space-y-1.5">
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {t('analysis.hodoscope.tags.runTagsInherited')}
                    </div>
                    <div className="space-y-1">
                      {selectedRunTags.map((tag) => (
                        <div
                          key={tag.id}
                          className="rounded-md border border-blue-border/70 bg-blue-bg/20 px-2 py-1.5"
                          title={`${getTagScopeLabel(tag, tagLabels)} · ${getTagSourceLabel(tag, tagLabels)}`}
                        >
                          <Badge
                            variant="outline"
                            className="max-w-full border-blue-border font-normal text-blue-text"
                          >
                            <span className="truncate">
                              {getTagDisplayLabel(tag)}
                            </span>
                          </Badge>
                          <div className="mt-1 text-[10px] text-muted-foreground">
                            {getTagScopeLabel(tag, tagLabels)} ·{' '}
                            {getTagSourceLabel(tag, tagLabels)}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                {selectedPointTags.length === 0 ? (
                  <div className="rounded-md border border-dashed border-border px-2 py-3 text-center text-[11px] text-muted-foreground">
                    {t('analysis.hodoscope.tags.noneAttached')}
                  </div>
                ) : null}
              </section>
            ) : null}

            <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1.5 border-y border-border/60 py-3 text-[11px]">
              {selectedPoint.task_id ? (
                <>
                  <dt className="text-muted-foreground">
                    {t('analysis.hodoscope.inspector.task')}
                  </dt>
                  <dd
                    className="truncate font-medium"
                    title={selectedPoint.task_id}
                  >
                    {selectedPoint.task_id}
                  </dd>
                </>
              ) : null}
              <dt className="text-muted-foreground">
                {t('analysis.hodoscope.inspector.transcript')}
              </dt>
              <dd className="font-medium tabular-nums">
                {t('analysis.hodoscope.inspector.transcriptAction', {
                  transcript: selectedPoint.transcript_idx + 1,
                  action: selectedPoint.action_unit_idx + 1,
                })}
              </dd>
              {selectedPoint.exception_type ? (
                <>
                  <dt className="text-muted-foreground">
                    {t('analysis.hodoscope.inspector.exception')}
                  </dt>
                  <dd className="truncate font-medium text-orange-text">
                    {selectedPoint.exception_type}
                  </dd>
                </>
              ) : null}
            </dl>

            {selectedTrajectoryPath ? (
              <section className="rounded-lg border border-blue-border/70 bg-blue-bg/20 p-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-1.5 text-xs font-semibold">
                      <Route className="h-3.5 w-3.5 text-blue-text" />
                      {t('analysis.hodoscope.path.title')}
                    </div>
                    <div className="mt-1 text-[10px] tabular-nums text-muted-foreground">
                      {selectedPathStepIndex >= 0
                        ? t('analysis.hodoscope.path.stepCount', {
                            step: selectedPathStepIndex + 1,
                            count: selectedPathPointIds.length,
                          })
                        : t('analysis.hodoscope.path.notInOrderedPath')}
                    </div>
                  </div>
                  <Badge
                    variant="outline"
                    className={cn(
                      'shrink-0 font-normal',
                      selectedTrajectoryPath.complete === true
                        ? 'border-green-border bg-green-bg text-green-text'
                        : selectedTrajectoryPath.complete === false
                          ? 'border-orange-border bg-orange-bg text-orange-text'
                          : 'border-border bg-muted text-muted-foreground'
                    )}
                  >
                    {selectedTrajectoryPath.complete === true
                      ? t('analysis.hodoscope.path.complete')
                      : selectedTrajectoryPath.complete === false
                        ? t('analysis.hodoscope.path.sampled')
                        : t('analysis.hodoscope.path.coverageUnknown')}
                  </Badge>
                </div>
                <div className="mt-2 text-[11px] font-medium tabular-nums">
                  {selectedPathCoverage}
                </div>
                <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">
                  {selectedPathNotice}
                </p>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="mt-2 h-7 w-full gap-1.5 text-[11px]"
                  aria-pressed={showSelectedPath}
                  onClick={() => setShowSelectedPath((current) => !current)}
                >
                  <Route className="h-3 w-3" />
                  {showSelectedPath
                    ? t('analysis.hodoscope.path.hide')
                    : t('analysis.hodoscope.path.show')}
                </Button>
              </section>
            ) : null}

            <Button
              type="button"
              className="w-full gap-2"
              size="sm"
              onClick={() => onOpenPoint(selectedPoint)}
            >
              {t('analysis.hodoscope.openSourceRun')}
              <ExternalLink className="h-3.5 w-3.5" />
            </Button>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <div className="text-xs font-semibold">
                  {t('analysis.hodoscope.representatives.title')}
                </div>
                <div className="text-[10px] text-muted-foreground">
                  {t('analysis.hodoscope.representatives.fpsDiversity')}
                </div>
              </div>
              <div className="space-y-1">
                {representatives.map((point) => (
                  <button
                    key={point.id}
                    type="button"
                    className={cn(
                      'group flex w-full items-start gap-2 rounded-lg border border-transparent px-2 py-2 text-left text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      selectedPoint.id === point.id
                        ? 'border-blue-border bg-blue-bg'
                        : 'hover:border-border hover:bg-muted/50'
                    )}
                    onClick={() => {
                      selectionClearedRef.current = false;
                      onSelectedPointChange(point.id);
                    }}
                    onDoubleClick={() => onOpenPoint(point)}
                  >
                    <span
                      className="mt-1 h-2 w-2 shrink-0 rounded-full ring-2 ring-background"
                      style={{
                        backgroundColor: pointColor(
                          point,
                          colorMode,
                          groupNames
                        ),
                      }}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="line-clamp-2 leading-snug">
                        {point.summary}
                      </span>
                      <span className="mt-1 block text-[10px] text-muted-foreground">
                        {t('analysis.hodoscope.representatives.fpsRank', {
                          rank: point.fps_rank,
                        })}
                        {point.task_id ? ` · ${point.task_id}` : ''}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex h-full min-h-48 flex-col items-center justify-center px-4 text-center">
            <div className="mb-3 rounded-full border border-border bg-muted/40 p-3">
              <Focus className="h-5 w-5 text-muted-foreground" />
            </div>
            <div className="text-sm font-medium">
              {t('analysis.hodoscope.inspector.selectAction')}
            </div>
            <p className="mt-1 max-w-60 text-xs leading-relaxed text-muted-foreground">
              {t('analysis.hodoscope.inspector.selectActionHelp')}
            </p>
          </div>
        )}
      </div>

      <div className="border-t border-border/70 bg-muted/20 px-3 py-2 text-[10px] leading-relaxed text-muted-foreground">
        {t('analysis.hodoscope.map.axesNote', {
          method: projection.projection_method.toUpperCase(),
        })}
      </div>
    </aside>
  );

  return (
    <div
      ref={shellRef}
      className={cn(
        'h-full min-h-0 rounded-xl border border-border/80 bg-card shadow-sm',
        isWide ? 'overflow-hidden' : 'overflow-y-auto'
      )}
    >
      <ResizablePanelGroup
        key={isWide ? 'wide' : 'narrow'}
        direction={isWide ? 'horizontal' : 'vertical'}
        autoSaveId={`${layoutStorageKey}-${isWide ? 'wide' : 'narrow'}`}
        className={cn(!isWide && 'min-h-[720px]')}
      >
        <ResizablePanel
          id="hodoscope-map"
          order={1}
          defaultSize={isWide ? 66 : 70}
          minSize={isWide ? 48 : 55}
          className="min-h-0 min-w-0 overflow-hidden"
        >
          {mapPanel}
        </ResizablePanel>
        <ResizableHandle
          withHandle
          aria-label={t('analysis.hodoscope.map.resize')}
        />
        <ResizablePanel
          id="hodoscope-inspector"
          order={2}
          defaultSize={isWide ? 34 : 30}
          minSize={isWide ? 26 : 20}
          className="min-h-0 min-w-0 overflow-hidden"
        >
          {inspectorPanel}
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}
