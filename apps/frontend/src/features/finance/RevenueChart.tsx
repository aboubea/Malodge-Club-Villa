import { useState } from 'react';
import { formatCurrency } from '../../lib/utils';

interface DataPoint {
  date: string;
  amount: number;
}

interface RevenueChartProps {
  data: DataPoint[];
}

export function RevenueChart({ data }: RevenueChartProps) {
  const [tooltip, setTooltip] = useState<{ x: number; y: number; point: DataPoint } | null>(null);

  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-[#6B6B6F] text-sm">
        Aucune donnée disponible
      </div>
    );
  }

  const PADDING = { top: 20, right: 16, bottom: 40, left: 56 };
  const WIDTH = 800;
  const HEIGHT = 220;
  const CHART_W = WIDTH - PADDING.left - PADDING.right;
  const CHART_H = HEIGHT - PADDING.top - PADDING.bottom;

  const maxAmount = Math.max(...data.map((d) => d.amount), 1);
  const barWidth = Math.max(4, Math.min(32, CHART_W / data.length - 4));
  const barSpacing = CHART_W / data.length;

  // Y-axis ticks
  const yTicks = 4;
  const yStep = maxAmount / yTicks;

  // Format date label
  function formatLabel(date: string): string {
    const d = new Date(date);
    return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
  }

  return (
    <div className="relative w-full">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="w-full"
        style={{ maxHeight: '220px' }}
        onMouseLeave={() => setTooltip(null)}
      >
        {/* Y grid lines and labels */}
        {Array.from({ length: yTicks + 1 }).map((_, i) => {
          const value = yStep * i;
          const y = PADDING.top + CHART_H - (CHART_H * i) / yTicks;
          return (
            <g key={i}>
              <line
                x1={PADDING.left}
                y1={y}
                x2={PADDING.left + CHART_W}
                y2={y}
                stroke="#242428"
                strokeWidth="1"
              />
              <text
                x={PADDING.left - 8}
                y={y + 4}
                textAnchor="end"
                fontSize="10"
                fill="#6B6B6F"
              >
                {value >= 1000 ? `${Math.round(value / 1000)}k` : Math.round(value)}€
              </text>
            </g>
          );
        })}

        {/* Bars */}
        {data.map((point, i) => {
          const barH = maxAmount > 0 ? (point.amount / maxAmount) * CHART_H : 0;
          const x = PADDING.left + i * barSpacing + barSpacing / 2 - barWidth / 2;
          const y = PADDING.top + CHART_H - barH;

          return (
            <g key={point.date}>
              {/* Bar background (hover) */}
              <rect
                x={PADDING.left + i * barSpacing}
                y={PADDING.top}
                width={barSpacing}
                height={CHART_H}
                fill="transparent"
                className="cursor-pointer"
                onMouseEnter={(e) => {
                  const svgRect = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
                  setTooltip({
                    x: e.clientX - svgRect.left,
                    y: e.clientY - svgRect.top,
                    point,
                  });
                }}
                onMouseMove={(e) => {
                  const svgRect = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
                  setTooltip({
                    x: e.clientX - svgRect.left,
                    y: e.clientY - svgRect.top,
                    point,
                  });
                }}
              />
              {/* Actual bar */}
              <rect
                x={x}
                y={y}
                width={barWidth}
                height={barH}
                rx="3"
                fill={tooltip?.point.date === point.date ? '#E8C98A' : '#C9A96E'}
                className="transition-colors duration-100"
              />
              {/* X label — show every nth item to avoid crowding */}
              {(data.length <= 10 || i % Math.ceil(data.length / 10) === 0) && (
                <text
                  x={x + barWidth / 2}
                  y={PADDING.top + CHART_H + 16}
                  textAnchor="middle"
                  fontSize="9"
                  fill="#6B6B6F"
                >
                  {formatLabel(point.date)}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      {/* Tooltip */}
      {tooltip && (
        <div
          className="absolute pointer-events-none z-10 bg-[#1A1A1D] border border-[#242428] rounded-lg px-3 py-2 shadow-xl"
          style={{
            left: `${(tooltip.x / 800) * 100}%`,
            top: `${(tooltip.y / 220) * 100}%`,
            transform: 'translate(-50%, -110%)',
          }}
        >
          <p className="text-xs text-[#6B6B6F]">
            {new Date(tooltip.point.date).toLocaleDateString('fr-FR', {
              day: 'numeric',
              month: 'long',
            })}
          </p>
          <p className="text-sm font-medium text-[#C9A96E]">
            {formatCurrency(tooltip.point.amount)}
          </p>
        </div>
      )}
    </div>
  );
}
