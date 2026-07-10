import { HodoscopeTrajectoryPath } from '../api/hodoscopeApi';

interface PointPosition {
  x: number;
  y: number;
}

interface HodoscopeTrajectoryLayerProps {
  path: HodoscopeTrajectoryPath;
  positions: Map<string, PointPosition>;
  scale: number;
}

function directionSegments(positions: PointPosition[]) {
  const segmentCount = positions.length - 1;
  if (segmentCount < 1) return [];

  const indicatorCount = Math.min(5, segmentCount);
  const indices = new Set<number>();
  for (let index = 1; index <= indicatorCount; index += 1) {
    indices.add(
      Math.min(
        segmentCount - 1,
        Math.floor((index * segmentCount) / (indicatorCount + 1))
      )
    );
  }

  return Array.from(indices)
    .map((index) => {
      const start = positions[index];
      const end = positions[index + 1];
      const dx = end.x - start.x;
      const dy = end.y - start.y;
      if (dx === 0 && dy === 0) return null;
      return {
        x: start.x + dx / 2,
        y: start.y + dy / 2,
        angle: (Math.atan2(dy, dx) * 180) / Math.PI,
      };
    })
    .filter(
      (indicator): indicator is { x: number; y: number; angle: number } =>
        indicator !== null
    );
}

export function HodoscopeTrajectoryLayer({
  path,
  positions,
  scale,
}: HodoscopeTrajectoryLayerProps) {
  const orderedPositions = path.point_ids
    .map((pointId) => positions.get(pointId))
    .filter((position): position is PointPosition => Boolean(position));

  if (orderedPositions.length === 0) return null;

  const pathData = orderedPositions
    .map(
      (position, index) =>
        `${index === 0 ? 'M' : 'L'} ${position.x} ${position.y}`
    )
    .join(' ');
  const start = orderedPositions[0];
  const end = orderedPositions[orderedPositions.length - 1];
  const pathColor = 'hsl(var(--blue-text))';
  const isCoverageComplete = path.complete === true;
  const indicators = directionSegments(orderedPositions);

  return (
    <g aria-hidden="true" pointerEvents="none">
      {orderedPositions.length > 1 ? (
        <>
          <path
            d={pathData}
            fill="none"
            stroke="hsl(var(--background))"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeOpacity={0.94}
            strokeWidth={6}
            vectorEffect="non-scaling-stroke"
          />
          <path
            d={pathData}
            fill="none"
            stroke={pathColor}
            strokeDasharray={isCoverageComplete ? undefined : '8 5'}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeOpacity={0.88}
            strokeWidth={2.5}
            vectorEffect="non-scaling-stroke"
          />
          {indicators.map((indicator, index) => (
            <path
              key={`${indicator.x}-${indicator.y}-${index}`}
              d="M -5 -4 L 5 0 L -5 4 Z"
              fill={pathColor}
              stroke="hsl(var(--background))"
              strokeWidth={1.25}
              transform={`translate(${indicator.x} ${indicator.y}) rotate(${indicator.angle}) scale(${1 / scale})`}
            />
          ))}
        </>
      ) : null}

      <g transform={`translate(${start.x} ${start.y}) scale(${1 / scale})`}>
        <circle
          r={7}
          fill="hsl(var(--background))"
          stroke={pathColor}
          strokeWidth={2}
        />
        <text
          dominantBaseline="central"
          fill={pathColor}
          fontSize={orderedPositions.length === 1 ? 5 : 7}
          fontWeight={700}
          textAnchor="middle"
        >
          {orderedPositions.length === 1 ? 'S/E' : 'S'}
        </text>
      </g>

      {orderedPositions.length > 1 ? (
        <g transform={`translate(${end.x} ${end.y}) scale(${1 / scale})`}>
          <circle
            r={7}
            fill="hsl(var(--background))"
            stroke={pathColor}
            strokeWidth={2}
          />
          <text
            dominantBaseline="central"
            fill={pathColor}
            fontSize={7}
            fontWeight={700}
            textAnchor="middle"
          >
            E
          </text>
        </g>
      ) : null}
    </g>
  );
}
