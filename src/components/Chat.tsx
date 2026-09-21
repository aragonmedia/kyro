/**
 * Campaign chat.
 *
 * Two kinds of conversation, deliberately not the same thing:
 *
 *   campaign   — the brand and every accepted creator, in one room. This is
 *                where a creator meets the others working the same product.
 *   submission — one creator and the brand, about one video. This is what the
 *                "Message brand" button on a passed-over video opens, because
 *                nobody wants their feedback read by the whole roster.
 *
 * New messages arrive by polling rather than a socket. At this size the
 * difference is invisible, and a poll cannot leave the room silently dead
 * after a dropped connection the way an unattended subscription can.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, MessagesSquare, Play, RefreshCw, Send, Users, X } from 'lucide-react';
import {
  getThreadVideo,
  listMessages,
  listMyThreads,
  markThreadRead,
  sendMessage,
  type ChatMessage,
  type ThreadSummary,
  type ThreadVideo,
  type UsageState,
} from '../lib/db';
import { useSession } from '../lib/session';
import { signedVideoUrl } from '../lib/storage';
import { CoverImage } from './MediaTile';

const POLL_MS = 8000;

const clock = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

const dayStamp = (iso: string) => {
  const d = new Date(iso);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  if (sameDay) return 'Today';
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

const relative = (iso: string | null) => {
  if (!iso) return '';
  const mins = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  if (mins < 1440) return `${Math.round(mins / 60)}h`;
  return `${Math.round(mins / 1440)}d`;
};

const at = (h: string | null) => (h ? `@${h.replace(/^@+/, '')}` : 'Creator');

/** The same thread reads differently depending on who is looking at it. */
function titleFor(t: ThreadSummary, viewerIsBrand: boolean) {
  if (t.kind === 'campaign') return t.campaignName;
  return viewerIsBrand ? `${at(t.creatorHandle)}'s video` : `Your video · ${t.campaignName}`;
}

function subtitleFor(t: ThreadSummary, viewerIsBrand: boolean) {
  if (t.kind === 'campaign') return `${t.brandName} · everyone on this campaign`;
  return viewerIsBrand ? `${t.campaignName} · private` : `${t.brandName} · private`;
}

const USAGE_TONE: Record<UsageState, { label: string; cls: string }> = {
  in_use: { label: 'In use', cls: 'border-emerald-400/30 bg-emerald-400/15 text-emerald-300' },
  not_used: { label: 'Not used', cls: 'border-amber-400/30 bg-amber-400/15 text-amber-300' },
  awaiting: { label: 'Pending review', cls: 'border-purple-400/40 bg-purple-500/20 text-purple-200' },
};

/* ─────────────────────────────────────────────────────────────
   The video a conversation is about

   Pinned at the top of a video thread for both sides, so nobody has to
   leave the chat to remember which video, or what the brand said about it.
   ───────────────────────────────────────────────────────────── */

function VideoContextCard({ threadId, viewerIsBrand }: { threadId: string; viewerIsBrand: boolean }) {
  const [video, setVideo] = useState<ThreadVideo | null>(null);
  const [src, setSrc] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setVideo(null);
    setSrc(null);
    setNotice(null);
    void (async () => {
      const res = await getThreadVideo(threadId);
      if (alive) setVideo(res.data);
    })();
    return () => { alive = false; };
  }, [threadId]);

  useEffect(() => {
    if (!src) return;
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setSrc(null); };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [src]);

  if (!video) return null;

  const poster = video.thumbnailUrl ?? video.coverUrl;
  const demo = !video.videoPath || video.videoPath.startsWith('demo/');
  const tone = USAGE_TONE[video.usage];

  const play = async () => {
    setNotice(null);
    if (demo) { setNotice('Demo video: no file is stored for this one.'); return; }
    setOpening(true);
    const url = await signedVideoUrl(video.videoPath as string);
    setOpening(false);
    if (!url) { setNotice("Couldn't load this video. It may still be processing."); return; }
    setSrc(url);
  };

  return (
    <>
      <div className="px-4 py-3 border-b border-line bg-surface-2/40 flex gap-3">
        <button
          type="button"
          onClick={() => void play()}
          className="relative w-14 aspect-[9/16] rounded-lg overflow-hidden border border-line flex-shrink-0 group"
          aria-label="Play video"
        >
          <CoverImage src={poster} name={video.campaignName} />
          <span className="absolute inset-0 flex items-center justify-center bg-black/25 group-hover:bg-black/40 transition">
            {opening
              ? <RefreshCw size={14} className="text-white animate-spin" />
              : <Play size={14} className="text-white fill-white" />}
          </span>
        </button>
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-heading truncate">
              {viewerIsBrand ? at(video.creatorHandle) : 'Your video'}
            </p>
            <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold border ${tone.cls}`}>{tone.label}</span>
          </div>
          <p className="text-xs text-muted truncate">
            {video.campaignName} · uploaded {new Date(video.submittedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </p>
          {video.brandNote && (
            <p className="text-xs text-body leading-snug line-clamp-2">
              <span className="text-faint">{viewerIsBrand ? 'Your note: ' : `${video.brandName}'s note: `}</span>
              {video.brandNote}
            </p>
          )}
          {notice && <p className="text-xs text-faint">{notice}</p>}
        </div>
      </div>

      {src && (
        <div
          className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setSrc(null)}
        >
          <div className="relative w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => setSrc(null)}
              className="absolute -top-10 right-0 text-white/80 hover:text-white"
              aria-label="Close video"
            >
              <X size={22} />
            </button>
            <video
              src={src}
              poster={poster ?? undefined}
              controls
              autoPlay
              playsInline
              className="w-full max-h-[80vh] rounded-xl bg-black object-contain"
            />
          </div>
        </div>
      )}
    </>
  );
}

/* ─────────────────────────────────────────────────────────────
   Thread list
   ───────────────────────────────────────────────────────────── */

function ThreadRow({
  thread,
  active,
  viewerIsBrand,
  onOpen,
}: {
  thread: ThreadSummary;
  active: boolean;
  viewerIsBrand: boolean;
  onOpen: () => void;
}) {
  const Icon = thread.kind === 'campaign' ? Users : MessagesSquare;
  return (
    <button
      type="button"
      onClick={onOpen}
      className={`w-full text-left p-4 flex items-start gap-3 transition ${
        active ? 'bg-surface-2' : 'hover:bg-surface-2'
      }`}
    >
      {thread.kind === 'submission' && thread.videoThumb ? (
        <div className="w-9 aspect-[9/16] rounded-md overflow-hidden border border-line flex-shrink-0">
          <CoverImage src={thread.videoThumb} name={thread.campaignName} />
        </div>
      ) : (
        <div className="w-9 h-9 rounded-lg bg-surface-2 border border-line flex items-center justify-center flex-shrink-0">
          <Icon size={15} className="text-body" />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="font-semibold text-heading text-sm truncate flex-1">{titleFor(thread, viewerIsBrand)}</p>
          <span className="text-[11px] text-faint flex-shrink-0">{relative(thread.lastAt)}</span>
        </div>
        <p className="text-xs text-faint truncate">{subtitleFor(thread, viewerIsBrand)}</p>
        <p className="text-xs text-muted truncate mt-1">
          {thread.lastBody
            ? `${thread.lastSender ? `${thread.lastSender}: ` : ''}${thread.lastBody}`
            : 'No messages yet.'}
        </p>
      </div>
      {thread.unread > 0 && (
        <span className="flex-shrink-0 min-w-[20px] h-5 px-1.5 rounded-full bg-gradient-kyro text-white text-[11px] font-bold flex items-center justify-center">
          {thread.unread > 99 ? '99+' : thread.unread}
        </span>
      )}
    </button>
  );
}

/* ─────────────────────────────────────────────────────────────
   One conversation
   ───────────────────────────────────────────────────────────── */

function Conversation({
  thread,
  onBack,
  onRead,
}: {
  thread: ThreadSummary;
  onBack: () => void;
  onRead: () => void;
}) {
  const session = useSession();
  const userId = session.userId;
  const viewerIsBrand = session.role === 'brand';
  const [messages, setMessages] = useState<ChatMessage[] | null>(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottom = useRef<HTMLDivElement | null>(null);

  /**
   * `onRead` refreshes the thread list, which re-renders this component's
   * parent and hands back a new function each time. Depending on it directly
   * put `load` on a new identity every render, which re-fired the effect
   * below, which reset `messages` to null, which is why the pane sat on
   * "Loading…" forever. Holding it in a ref keeps the callback current
   * without making it a dependency.
   */
  const onReadRef = useRef(onRead);
  useEffect(() => { onReadRef.current = onRead; }, [onRead]);

  /** How many messages the badge was last cleared against. */
  const seen = useRef(-1);

  const load = useCallback(
    async (scroll: boolean) => {
      const res = await listMessages(thread.id);
      setMessages(res.data);
      setError(res.error);

      // Only clear the badge when something actually arrived, so a quiet
      // thread does not refetch the whole list every poll.
      if (userId && res.data.length !== seen.current) {
        seen.current = res.data.length;
        await markThreadRead(thread.id, userId);
        onReadRef.current();
      }

      if (scroll) {
        requestAnimationFrame(() => bottom.current?.scrollIntoView({ block: 'end' }));
      }
    },
    [thread.id, userId]
  );

  useEffect(() => {
    seen.current = -1;
    setMessages(null);
    void load(true);
    const timer = setInterval(() => void load(false), POLL_MS);
    return () => clearInterval(timer);
  }, [load]);

  const send = async () => {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    setError(null);
    const res = await sendMessage(thread.id, text);
    setSending(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    setDraft('');
    await load(true);
  };

  // Group by calendar day so a long thread reads as a conversation rather
  // than an undifferentiated column of bubbles.
  const grouped = useMemo(() => {
    const out: Array<{ day: string; items: ChatMessage[] }> = [];
    for (const m of messages ?? []) {
      const day = dayStamp(m.createdAt);
      const last = out[out.length - 1];
      if (last && last.day === day) last.items.push(m);
      else out.push({ day, items: [m] });
    }
    return out;
  }, [messages]);

  return (
    <div className="flex flex-col h-[70vh] min-h-[420px]">
      <div className="p-4 border-b border-line flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          className="md:hidden text-muted hover:text-heading flex-shrink-0"
          aria-label="Back to conversations"
        >
          <ArrowLeft size={18} />
        </button>
        <div className="min-w-0">
          <p className="font-semibold text-heading truncate">{titleFor(thread, viewerIsBrand)}</p>
          <p className="text-xs text-faint truncate">{subtitleFor(thread, viewerIsBrand)}</p>
        </div>
      </div>

      {thread.kind === 'submission' && <VideoContextCard threadId={thread.id} viewerIsBrand={viewerIsBrand} />}

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages === null && <p className="text-center text-sm text-muted py-8">Loading…</p>}

        {messages !== null && messages.length === 0 && (
          <div className="text-center py-10">
            <MessagesSquare size={26} className="mx-auto text-faint mb-3" />
            <p className="text-sm text-muted">No messages yet.</p>
            <p className="text-xs text-faint mt-1">
              {thread.kind === 'campaign'
                ? 'Say hello to the brand and the other creators on this campaign.'
                : viewerIsBrand
                  ? 'Tell the creator what you think of this video.'
                  : 'Ask the brand anything about this video.'}
            </p>
          </div>
        )}

        {grouped.map((group) => (
          <div key={group.day} className="space-y-3">
            <p className="text-center text-[11px] font-semibold text-faint">{group.day}</p>
            {group.items.map((m) => {
              const mine = m.senderUserId === session.userId;
              return (
                <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[80%] sm:max-w-[70%] space-y-1 ${mine ? 'items-end' : ''}`}>
                    {!mine && (
                      <div className="flex items-center gap-1.5 px-1">
                        <span className="text-xs font-semibold text-body">{m.senderName}</span>
                        {m.senderRole === 'brand' && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-purple-400/15 text-purple-300 border border-purple-400/25">
                            BRAND
                          </span>
                        )}
                      </div>
                    )}
                    <div
                      className={`px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap break-words ${
                        mine
                          ? 'bg-gradient-kyro text-white rounded-br-sm'
                          : 'bg-surface-2 border border-line text-body rounded-bl-sm'
                      }`}
                    >
                      {m.body}
                    </div>
                    <p className={`text-[11px] text-faint px-1 ${mine ? 'text-right' : ''}`}>
                      {clock(m.createdAt)}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        ))}
        <div ref={bottom} />
      </div>

      {error && <p className="px-4 pb-2 text-xs text-pink-300">{error}</p>}

      <div className="p-3 border-t border-line flex items-end gap-2">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            // Enter sends, Shift+Enter breaks the line. Matches every other
            // chat a creator uses.
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
          rows={1}
          placeholder="Write a message…"
          className="flex-1 px-3.5 py-2.5 bg-surface-2 border border-line rounded-xl text-sm text-heading placeholder:text-faint focus:outline-none focus:border-purple-500 resize-none max-h-32"
        />
        <button
          type="button"
          onClick={() => void send()}
          disabled={sending || !draft.trim()}
          className="w-10 h-10 rounded-xl bg-gradient-kyro text-white flex items-center justify-center flex-shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
          aria-label="Send"
        >
          <Send size={16} />
        </button>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   The tab
   ───────────────────────────────────────────────────────────── */

export function ChatPanel({ openThreadId }: { openThreadId?: string | null }) {
  const session = useSession();
  const viewerIsBrand = session.role === 'brand';
  const [threads, setThreads] = useState<ThreadSummary[] | null>(null);
  const [activeId, setActiveId] = useState<string | null>(openThreadId ?? null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await listMyThreads();
    setThreads(res.data);
    setError(res.error);
  }, []);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(timer);
  }, [load]);

  // A thread opened from elsewhere (the Message brand button) wins over
  // whatever was selected here.
  // A thread just created elsewhere is not in the list yet, so fetch again.
  useEffect(() => {
    if (!openThreadId) return;
    setActiveId(openThreadId);
    void load();
  }, [openThreadId, load]);

  const active = (threads ?? []).find((t) => t.id === activeId) ?? null;

  return (
    <div className="bg-surface border border-line rounded-2xl overflow-hidden">
      <div className="grid md:grid-cols-[320px_1fr]">
        {/* List. Hidden on mobile once a conversation is open, so the phone
            shows one thing at a time instead of two half things. */}
        <div className={`border-b md:border-b-0 md:border-r border-line ${active ? 'hidden md:block' : ''}`}>
          <div className="p-4 border-b border-line">
            <h2 className="font-bold text-heading">Conversations</h2>
            <p className="text-xs text-muted mt-0.5">
              {viewerIsBrand
                ? 'Campaign rooms and private threads with creators about their videos.'
                : 'Campaign rooms and your private threads with brands.'}
            </p>
          </div>

          {error && <p className="p-4 text-sm text-pink-300">{error}</p>}
          {threads === null && <p className="p-8 text-center text-sm text-muted">Loading…</p>}

          {threads !== null && threads.length === 0 && (
            <div className="p-8 text-center">
              <MessagesSquare size={26} className="mx-auto text-faint mb-3" />
              <p className="text-sm text-muted">No conversations yet.</p>
              <p className="text-xs text-faint mt-1">
                Get accepted onto a campaign and its room opens up here.
              </p>
            </div>
          )}

          {threads !== null && threads.length > 0 && (
            <div className="divide-y divide-line max-h-[70vh] overflow-y-auto">
              {threads.map((t) => (
                <ThreadRow
                  key={t.id}
                  thread={t}
                  active={t.id === activeId}
                  viewerIsBrand={viewerIsBrand}
                  onOpen={() => setActiveId(t.id)}
                />
              ))}
            </div>
          )}
        </div>

        <div className={active ? '' : 'hidden md:block'}>
          {active ? (
            <Conversation thread={active} onBack={() => setActiveId(null)} onRead={load} />
          ) : (
            <div className="h-[70vh] min-h-[420px] flex flex-col items-center justify-center text-center p-8">
              <MessagesSquare size={30} className="text-faint mb-3" />
              <p className="text-sm text-muted">Pick a conversation.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** Total unread across every thread, for the tab badge. */
export function useUnreadTotal(): number {
  const [total, setTotal] = useState(0);

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      const res = await listMyThreads();
      if (alive) setTotal(res.data.reduce((sum, t) => sum + t.unread, 0));
    };
    void tick();
    const timer = setInterval(() => void tick(), POLL_MS * 2);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);

  return total;
}
