import { HTMLAttributes } from 'react';
import { cn } from '../../lib/utils';

interface SkeletonProps extends HTMLAttributes<HTMLDivElement> {
  width?: string | number;
  height?: string | number;
  rounded?: boolean;
  circle?: boolean;
}

export function Skeleton({
  width,
  height,
  rounded = false,
  circle = false,
  className,
  style,
  ...props
}: SkeletonProps) {
  return (
    <div
      className={cn(
        'shimmer',
        rounded && 'rounded-full',
        circle && 'rounded-full',
        !rounded && !circle && 'rounded-lg',
        className,
      )}
      style={{
        width: width
          ? typeof width === 'number'
            ? `${width}px`
            : width
          : undefined,
        height: height
          ? typeof height === 'number'
            ? `${height}px`
            : height
          : undefined,
        ...style,
      }}
      {...props}
    />
  );
}

export function SkeletonCard() {
  return (
    <div className="rounded-xl border border-[#242428] bg-[#111113] p-5 space-y-3">
      <Skeleton height={20} width="60%" />
      <Skeleton height={14} width="80%" />
      <Skeleton height={14} width="40%" />
      <div className="flex gap-2 pt-1">
        <Skeleton height={28} width={80} rounded />
        <Skeleton height={28} width={60} rounded />
      </div>
    </div>
  );
}

export function SkeletonTable({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 p-3 rounded-lg border border-[#242428]">
          <Skeleton circle width={36} height={36} />
          <div className="flex-1 space-y-2">
            <Skeleton height={14} width="30%" />
            <Skeleton height={12} width="50%" />
          </div>
          <Skeleton height={24} width={80} rounded />
        </div>
      ))}
    </div>
  );
}
