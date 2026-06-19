/**
 * R12 — useSubstrateEvents: consume the customer-safe SSE stream for one
 * substrate (snapshot-then-stream) via EventSource.
 *
 * Additive by design: this LAYERS ON TOP of useTierChangePoll. If EventSource
 * is unavailable, the stream errors, or no bus is wired on compute (the proxy
 * returns 503), this simply stays `connected: false` and the 3s poll remains
 * the source of truth. Callers typically pass `onEvent` to trigger an
 * immediate substrate refresh so the UI reflects a billing step within ~1s
 * instead of waiting for the next poll tick.
 *
 * EventSource sends the same-origin `mmpm_session` cookie automatically and
 * auto-reconnects on transient errors, so there's no manual retry here.
 */

"use client";

import { useEffect, useRef, useState } from "react";

export interface SubstrateLiveEvent {
  /** Customer-facing event type (charge | refund | provisioning_fee | cancellation_* | tier_change_*). */
  type: string;
  slug: string;
  amountUsd?: number;
  phase?: string;
  message: string;
  at: string;
}

export interface SubstrateLiveSnapshot {
  slug: string;
  status: string;
  tier?: string;
}

/** The customer-facing event types compute emits (substrate-customer-events.ts). */
const EVENT_TYPES = [
  "charge",
  "refund",
  "provisioning_fee",
  "cancellation_scheduled",
  "cancellation_refunded",
  "tier_change_failed",
  "tier_change_complete",
  "tier_change_rolled_back",
] as const;

export interface UseSubstrateEventsResult {
  connected: boolean;
  snapshot: SubstrateLiveSnapshot | null;
  lastEvent: SubstrateLiveEvent | null;
}

export function useSubstrateEvents(
  slug: string | null,
  opts: { enabled?: boolean; onEvent?: (event: SubstrateLiveEvent) => void } = {},
): UseSubstrateEventsResult {
  const enabled = opts.enabled ?? true;
  const [connected, setConnected] = useState(false);
  const [snapshot, setSnapshot] = useState<SubstrateLiveSnapshot | null>(null);
  const [lastEvent, setLastEvent] = useState<SubstrateLiveEvent | null>(null);

  // Keep the latest onEvent without resubscribing the stream each render.
  // Assign the ref in an effect (not during render) to satisfy
  // react-hooks/refs — this is the supported pattern.
  const onEventRef = useRef(opts.onEvent);
  useEffect(() => {
    onEventRef.current = opts.onEvent;
  });

  useEffect(() => {
    if (!enabled || !slug) return;
    // Graceful no-op where EventSource is unavailable (SSR, old engines) — the
    // poll fallback stays in charge.
    if (typeof EventSource === "undefined") return;

    const es = new EventSource(`/api/substrates/${slug}/events`);

    const onOpen = () => setConnected(true);
    // EventSource auto-reconnects; we just reflect the transient drop.
    const onErr = () => setConnected(false);
    const onSnapshot = (ev: MessageEvent) => {
      try {
        setSnapshot(JSON.parse(ev.data) as SubstrateLiveSnapshot);
      } catch {
        /* ignore malformed frame */
      }
    };
    const onNamed = (ev: MessageEvent) => {
      try {
        const event = JSON.parse(ev.data) as SubstrateLiveEvent;
        setLastEvent(event);
        onEventRef.current?.(event);
      } catch {
        /* ignore malformed frame */
      }
    };

    es.addEventListener("open", onOpen);
    es.addEventListener("error", onErr);
    es.addEventListener("snapshot", onSnapshot as EventListener);
    for (const t of EVENT_TYPES) es.addEventListener(t, onNamed as EventListener);

    return () => {
      es.close();
    };
  }, [slug, enabled]);

  return { connected, snapshot, lastEvent };
}
