import React from 'react';

interface StatusDotProps {
  status: 'ONLINE' | 'OFFLINE' | 'WARNING' | string;
  showText?: boolean;
  label?: string;
  size?: 'sm' | 'md';
}

export default function StatusDot({ status, showText = true, label, size = 'sm' }: StatusDotProps) {
  const isOnline = status.toUpperCase() === 'ONLINE';
  const isWarning = status.toUpperCase() === 'WARNING' || status.toUpperCase() === 'NEEDS ATTENTION';

  const dotColor = isOnline
    ? 'bg-emerald-500'
    : isWarning
    ? 'bg-amber-500'
    : 'bg-zinc-500';

  const textColor = isOnline
    ? 'text-emerald-400'
    : isWarning
    ? 'text-amber-400'
    : 'text-zinc-400';

  const displayLabel = label || (isOnline ? 'Online' : isWarning ? 'Needs Attention' : 'Offline');

  return (
    <div className="inline-flex items-center space-x-1.5 font-medium">
      <span className="relative flex h-2 w-2">
        {isOnline && (
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
        )}
        <span className={`relative inline-flex rounded-full h-2 w-2 ${dotColor}`}></span>
      </span>
      {showText && <span className={`text-xs ${textColor}`}>{displayLabel}</span>}
    </div>
  );
}
