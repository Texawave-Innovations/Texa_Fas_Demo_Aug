'use client';

import { useState, useEffect } from 'react';
import { Clock, CalendarDays } from 'lucide-react';

export function LiveClock() {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const hours = now.getHours();
  const minutes = now.getMinutes();
  const seconds = now.getSeconds();
  const isPM = hours >= 12;
  const displayHours = hours % 12 || 12;

  const weekday = now.toLocaleDateString('en-IN', { weekday: 'long' });
  const day = now.getDate();
  const month = now.toLocaleDateString('en-IN', { month: 'short' });
  const year = now.getFullYear();

  const pad = (n: number) => String(n).padStart(2, '0');

  return (
    <div className="flex items-center gap-3">
      {/* Calendar Card */}
      <div className="flex items-center gap-2.5 bg-gradient-to-r from-violet-50 to-purple-50 border border-violet-200 rounded-xl px-4 py-2.5 shadow-sm">
        <div className="bg-violet-600 text-white rounded-lg p-1.5">
          <CalendarDays className="h-4 w-4" />
        </div>
        <div className="flex flex-col leading-tight">
          <span className="text-[11px] font-medium text-violet-500 uppercase tracking-wide">{weekday}</span>
          <span className="text-sm font-bold text-violet-900">{day} {month} {year}</span>
        </div>
      </div>

      {/* Clock Card */}
      <div className="flex items-center gap-2.5 bg-gradient-to-r from-blue-50 to-cyan-50 border border-blue-200 rounded-xl px-4 py-2.5 shadow-sm">
        <div className="bg-blue-600 text-white rounded-lg p-1.5">
          <Clock className="h-4 w-4" />
        </div>
        <div className="flex items-baseline gap-1">
          <span className="text-lg font-bold tabular-nums text-blue-900">
            {pad(displayHours)}:{pad(minutes)}
          </span>
          <span className="text-sm font-bold tabular-nums text-blue-400">
            :{pad(seconds)}
          </span>
          <span className="text-[11px] font-semibold text-blue-500 uppercase ml-0.5">
            {isPM ? 'PM' : 'AM'}
          </span>
        </div>
      </div>
    </div>
  );
}
