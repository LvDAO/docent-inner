import {
  HodoscopeProjectionPoint,
  HodoscopeTagCatalogEntry,
} from '../api/hodoscopeApi';

export interface HodoscopeTagFacetGroup {
  facet: string;
  tags: HodoscopeTagCatalogEntry[];
}

export interface HodoscopeTagLabels {
  sources: Record<HodoscopeTagCatalogEntry['source'], string>;
  pointScope: string;
  runInheritedScope: string;
}

export function getTagDisplayLabel(tag: HodoscopeTagCatalogEntry) {
  return tag.label;
}

export function getTagSourceLabel(
  tag: HodoscopeTagCatalogEntry,
  labels: HodoscopeTagLabels
) {
  const sourceLabel = tag.source_label || labels.sources[tag.source];
  if (
    tag.result_label &&
    !sourceLabel.toLowerCase().includes(tag.result_label.toLowerCase())
  ) {
    return `${sourceLabel} · ${tag.result_label}`;
  }
  return sourceLabel;
}

export function getTagScopeLabel(
  tag: HodoscopeTagCatalogEntry,
  labels: HodoscopeTagLabels
) {
  return tag.scope === 'trajectory' || tag.inherited
    ? labels.runInheritedScope
    : labels.pointScope;
}

export function buildTagLookup(tags: HodoscopeTagCatalogEntry[]) {
  return new Map(tags.map((tag) => [tag.id, tag]));
}

export function getPointTags(
  point: HodoscopeProjectionPoint,
  tagById: Map<string, HodoscopeTagCatalogEntry>
) {
  return (point.tag_ids ?? [])
    .map((tagId) => tagById.get(tagId))
    .filter((tag): tag is HodoscopeTagCatalogEntry => Boolean(tag));
}

export function matchesPointTagFilters(
  point: HodoscopeProjectionPoint,
  selectedTagIds: ReadonlySet<string>,
  tagById: Map<string, HodoscopeTagCatalogEntry>
) {
  if (selectedTagIds.size === 0) return true;

  const selectedByFacet = new Map<string, Set<string>>();
  selectedTagIds.forEach((tagId) => {
    const tag = tagById.get(tagId);
    if (!tag) return;
    const facetSelection = selectedByFacet.get(tag.facet) ?? new Set<string>();
    facetSelection.add(tagId);
    selectedByFacet.set(tag.facet, facetSelection);
  });

  const pointTagIds = new Set(point.tag_ids ?? []);
  return Array.from(selectedByFacet.values()).every((facetSelection) =>
    Array.from(facetSelection).some((tagId) => pointTagIds.has(tagId))
  );
}

export function matchesHodoscopeSearch(
  point: HodoscopeProjectionPoint,
  normalizedQuery: string,
  tagById: Map<string, HodoscopeTagCatalogEntry>,
  labels: HodoscopeTagLabels
) {
  if (!normalizedQuery) return true;

  const tagText = getPointTags(point, tagById).flatMap((tag) => [
    getTagDisplayLabel(tag),
    getTagSourceLabel(tag, labels),
    tag.field,
  ]);

  return [
    point.summary,
    point.context_excerpt,
    point.group,
    point.task_id,
    point.exception_type,
    ...tagText,
  ]
    .filter((value): value is string => Boolean(value))
    .join(' ')
    .toLowerCase()
    .includes(normalizedQuery);
}

export function groupTagCatalog(
  tags: HodoscopeTagCatalogEntry[],
  normalizedQuery: string,
  labels: HodoscopeTagLabels
): HodoscopeTagFacetGroup[] {
  const matchingTags = normalizedQuery
    ? tags.filter((tag) =>
        [getTagDisplayLabel(tag), getTagSourceLabel(tag, labels), tag.field]
          .filter((value): value is string => Boolean(value))
          .join(' ')
          .toLowerCase()
          .includes(normalizedQuery)
      )
    : tags;

  const groups = new Map<string, HodoscopeTagCatalogEntry[]>();
  matchingTags.forEach((tag) => {
    const facetTags = groups.get(tag.facet) ?? [];
    facetTags.push(tag);
    groups.set(tag.facet, facetTags);
  });

  return Array.from(groups, ([facet, facetTags]) => ({
    facet,
    tags: [...facetTags].sort((a, b) =>
      getTagDisplayLabel(a).localeCompare(getTagDisplayLabel(b))
    ),
  })).sort((a, b) => a.facet.localeCompare(b.facet));
}
