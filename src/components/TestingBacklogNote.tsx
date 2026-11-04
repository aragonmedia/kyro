/**
 * Videos this brand approved and never ran.
 *
 * The bottleneck in creator marketing has flipped. A brand can now take in
 * more video than its media buying can test, so approving a video has
 * stopped meaning giving it a chance. The creator gets no money from a video
 * that never runs, and nothing useful either: a video that ran and flopped
 * at least tells them something about the hook.
 *
 * So this is a nudge, not a scoreboard. It is the brand's own backlog shown
 * to the brand, with the number that matters and nothing else. It appears
 * only when there is something to say.
 *
 * Deliberately not shown to creators. The same figure across several brands
 * would tell a creator whose campaigns are worth their time, which is a real
 * and useful thing, but with one brand on the platform it compares nothing,
 * and a brand's testing rate is not a creator's to see until it is a
 * comparison rather than a verdict.
 */

import { useEffect, useState } from 'react';
import { Inbox } from 'lucide-react';
import { getTestingBacklog, type TestingBacklog } from '../lib/db';

export function TestingBacklogNote({ brandId }: { brandId: string }) {
  const [data, setData] = useState<TestingBacklog | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const res = await getTestingBacklog(brandId);
      if (alive) setData(res.data);
    })();
    return () => { alive = false; };
  }, [brandId]);

  if (!data) return null;

  /* Without Meta connected there is no way to know which videos ran, so
     there is nothing to claim. Silence beats a number that would be a
     guess. */
  if (!data.metaConnected || data.approved === 0 || data.waiting === 0) return null;

  const share = Math.round((data.running / data.approved) * 100);

  return (
    <div className="flex items-start gap-3 p-4 rounded-xl border border-warn/30 bg-warn-soft">
      <Inbox size={16} className="text-warn flex-shrink-0 mt-0.5" />
      <div className="min-w-0 space-y-1">
        <p className="text-sm font-semibold text-heading">
          {data.waiting} approved {data.waiting === 1 ? 'video is' : 'videos are'} not running yet
        </p>
        <p className="text-sm text-muted leading-relaxed">
          {data.running === 0
            ? 'None of the videos you have approved are live as ads. A video that never runs earns the creator nothing and tells them nothing, which is the fastest way to lose the creators who are good.'
            : `${data.running} of ${data.approved} approved videos are live as ads, so ${share}% of what you accepted is being tested. The rest earn nobody anything while they wait.`}
        </p>
        <p className="text-xs text-faint leading-relaxed">
          Counted from the ads in your connected Meta account, matched by each video's tracking link.
        </p>
      </div>
    </div>
  );
}
