'use client';

import type { RefObject } from 'react';
import type { HistoryEntry, SessionStats } from '@/lib/types';

interface StatsSheetProps {
  stats: SessionStats;
  /** Number of unseen puzzles still in the queue. */
  queueSize: number;
  history: HistoryEntry[];
  onClose: () => void;
  /** Ref on the panel so the shell can detect click-away. */
  sheetRef: RefObject<HTMLDivElement | null>;
}

/**
 * Slide-in session summary, opened from the topbar stats cluster. Shows
 * solved-today / accuracy / streak / queue cards plus a 14-day solve
 * sparkline (green bars = net solves, red = net misses, full opacity = today).
 */
export function StatsSheet({ stats, queueSize, history, onClose, sheetRef }: StatsSheetProps) {
  const last14 = history.slice(-14);
  const padded: HistoryEntry[] = [
    ...Array(Math.max(0, 14 - last14.length)).fill({ date: '', correct: 0, wrong: 0 }),
    ...last14,
  ];

  const total = stats.correct + stats.wrong;
  const acc = total > 0 ? Math.round((stats.correct / total) * 100) : 0;
  const todayBucket = padded[padded.length - 1] ?? { correct: 0, wrong: 0 };
  const todayCount = todayBucket.correct + todayBucket.wrong;
  const max = Math.max(...padded.map((x) => x.correct + x.wrong), 1);

  return (
    <div className="stats-sheet" ref={sheetRef}>
      <h3>Session stats</h3>
      <div className="stats-grid">
        <div className="stat-card">
          <div className="lbl">Solved today</div>
          <div className="v">{todayCount}</div>
          <div className="delta">total {stats.correct}</div>
        </div>
        <div className="stat-card">
          <div className="lbl">Accuracy</div>
          <div className="v">{acc}%</div>
          <div className={'delta ' + (acc >= 60 ? '' : 'down')}>
            {stats.correct}/{total}
          </div>
        </div>
        <div className="stat-card">
          <div className="lbl">Streak</div>
          <div className="v">{stats.streak}</div>
          <div className="delta">best {Math.max(stats.bestStreak, stats.streak)}</div>
        </div>
        <div className="stat-card">
          <div className="lbl">Queue</div>
          <div className="v">{queueSize}</div>
          <div className="delta">unseen</div>
        </div>
      </div>

      <div>
        <div className="spark-h">Last 14 days</div>
        <div className="spark">
          {padded.map((d, i) => {
            const dayTotal = d.correct + d.wrong;
            const h = Math.max((dayTotal / max) * 100, 5);
            const isToday = i === padded.length - 1;
            return (
              <div
                key={i}
                className={'b' + (d.wrong > d.correct ? ' miss' : '') + (isToday ? ' today' : '')}
                style={{ height: h + '%' }}
                title={`${dayTotal} solves`}
              />
            );
          })}
        </div>
      </div>

      <button className="btn" onClick={onClose}>
        Close
      </button>
    </div>
  );
}
