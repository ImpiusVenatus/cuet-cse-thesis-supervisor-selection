'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  allocationApi,
  supervisorsApi,
  Student,
  Supervisor,
  sessionApi,
  SESSION_RESET_PASSWORD,
} from '@/lib/api';
import { remainingLotterySlotsDisplay, usesSharedSingleSeat } from '@/lib/supervisorCapacity';
import { AlertCircle, CheckCircle, Loader2, Wrench } from 'lucide-react';

export default function LotteryPage() {
  const queryClient = useQueryClient();
  const [revealModal, setRevealModal] = useState<{
    studentName: string;
    supervisorName: string;
    cardNumber: number;
  } | null>(null);
  const [endConfirmOpen, setEndConfirmOpen] = useState(false);

  const { data: queue, isPending: queuePending } = useQuery({
    queryKey: ['queue'],
    queryFn: allocationApi.getQueue,
    refetchInterval: 3000,
  });

  const { data: supervisors } = useQuery({
    queryKey: ['supervisors'],
    queryFn: () => supervisorsApi.list(),
    refetchInterval: 3000,
  });

  const { data: deck, isPending: deckPending } = useQuery({
    queryKey: ['lotteryDeck'],
    queryFn: allocationApi.getLotteryDeck,
    refetchInterval: 2500,
  });

  /** Temporary: full batch reset to setup only — same behavior as Choice page tool. */
  const devResetSessionMutation = useMutation({
    mutationFn: () => sessionApi.reset(SESSION_RESET_PASSWORD),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['session'] });
      queryClient.invalidateQueries({ queryKey: ['queue'] });
      queryClient.invalidateQueries({ queryKey: ['students'] });
      queryClient.invalidateQueries({ queryKey: ['supervisors'] });
      queryClient.invalidateQueries({ queryKey: ['lotteryDeck'] });
      setRevealModal(null);
      setEndConfirmOpen(false);
    },
    onError: (err: Error) => alert(err.message),
  });

  const pickMutation = useMutation({
    mutationFn: ({ studentId, cardNumber }: { studentId: number; cardNumber: number }) =>
      allocationApi.pickLotteryCard(studentId, cardNumber),
    onSuccess: (data: any, vars) => {
      queryClient.invalidateQueries({ queryKey: ['queue'] });
      queryClient.invalidateQueries({ queryKey: ['supervisors'] });
      queryClient.invalidateQueries({ queryKey: ['students'] });
      queryClient.invalidateQueries({ queryKey: ['lotteryDeck'] });
      setRevealModal({
        studentName: data.student?.name ?? 'Student',
        supervisorName: data.supervisor?.name ?? 'Supervisor',
        cardNumber: vars.cardNumber,
      });
    },
    onError: (err: Error) => alert(err.message),
  });

  const endSessionMutation = useMutation({
    mutationFn: sessionApi.complete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['session'] });
      queryClient.invalidateQueries({ queryKey: ['queue'] });
      setEndConfirmOpen(false);
    },
    onError: (err: Error) => alert(err.message),
  });

  const waiting = (queuePending && queue === undefined) || (deckPending && deck === undefined);
  if (waiting) {
    return (
      <div className="flex h-[100dvh] flex-col items-center justify-center gap-3 text-gray-500">
        <Loader2 className="h-10 w-10 animate-spin text-blue-600" aria-hidden />
        <p>Loading lottery…</p>
      </div>
    );
  }

  if (queue?.phase !== 'lottery_phase') {
    return (
      <div className="max-w-4xl mx-auto px-6 py-8">
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 text-center">
          <AlertCircle className="w-12 h-12 text-yellow-600 mx-auto mb-3" />
          <h3 className="text-lg font-semibold text-yellow-800">Not in Lottery Phase</h3>
          <p className="text-yellow-600 mt-2">
            Current phase: {queue?.phase?.replace('_', ' ') || 'unknown'}. Go to Config to start the lottery phase.
          </p>
        </div>
      </div>
    );
  }

  const currentStudent = queue?.current_student as Student | null | undefined;
  const cards = deck?.cards ?? 0;

  return (
    <div className="flex h-[100dvh] max-h-[100dvh] flex-col overflow-hidden px-4 py-3">
      <div className="mb-4 rounded-xl border border-amber-300/80 bg-amber-50 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-start gap-2 text-sm text-amber-950">
          <Wrench className="w-5 h-5 shrink-0 text-amber-700 mt-0.5" aria-hidden />
          <span>
            <strong className="font-semibold">Temporary design tool:</strong>{' '}
            resets this batch to setup (clears assignments and supervisor usage). Does not start the choice phase — use
            Session Config when you want to begin again.
          </span>
        </div>
        <button
          type="button"
          disabled={devResetSessionMutation.isPending || pickMutation.isPending || endSessionMutation.isPending}
          onClick={() => devResetSessionMutation.mutate()}
          className="inline-flex items-center gap-2 shrink-0 rounded-lg bg-amber-700 px-3 py-2 text-sm font-medium text-white hover:bg-amber-800 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {devResetSessionMutation.isPending ? (
            <Loader2 className="w-4 h-4 animate-spin" aria-hidden />
          ) : null}
          Reset session
        </button>
      </div>

      <div className="mb-2 flex shrink-0 flex-wrap items-center justify-between gap-2">
        <h2 className="text-xl font-bold text-gray-900">Lottery Phase</h2>
        <button
          type="button"
          onClick={() => setEndConfirmOpen(true)}
          disabled={endSessionMutation.isPending || devResetSessionMutation.isPending}
          className="rounded-lg bg-gray-900 px-3 py-2 text-sm font-semibold text-white hover:bg-gray-800 disabled:opacity-50"
        >
          End session
        </button>
      </div>

      {endConfirmOpen && (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center bg-black/45 p-4"
          role="presentation"
          onClick={() => !endSessionMutation.isPending && setEndConfirmOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="end-session-title"
            className="w-full max-w-md rounded-xl border border-gray-200 bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="end-session-title" className="text-lg font-semibold text-gray-900">
              End the ceremony session?
            </h3>
            <p className="mt-2 text-sm text-gray-600">
              This will mark the session as completed. Any currently unassigned students will remain unassigned until you
              reset/restart.
            </p>
            <div className="mt-6 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setEndConfirmOpen(false)}
                disabled={endSessionMutation.isPending}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => endSessionMutation.mutate()}
                disabled={endSessionMutation.isPending}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-800 disabled:opacity-50"
              >
                {endSessionMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
                End session
              </button>
            </div>
          </div>
        </div>
      )}

      {revealModal && (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center bg-black/45 p-4"
          role="presentation"
          onClick={() => setRevealModal(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="reveal-title"
            className="w-full max-w-md rounded-xl border border-green-200 bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex flex-col items-center text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-green-100">
                <CheckCircle className="h-8 w-8 text-green-600" aria-hidden />
              </div>
              <h3 id="reveal-title" className="mt-4 text-xl font-semibold text-gray-900">
                Card {revealModal.cardNumber} revealed
              </h3>
              <p className="mt-3 text-sm leading-relaxed text-gray-600">
                <span className="font-semibold text-gray-900">{revealModal.studentName}</span>
                {' '}is assigned to{' '}
                <span className="font-semibold text-gray-900">{revealModal.supervisorName}</span>.
              </p>
              <button
                type="button"
                onClick={() => setRevealModal(null)}
                className="mt-6 w-full rounded-lg bg-green-600 px-4 py-3 text-sm font-semibold text-white hover:bg-green-700"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_16rem]">
        <div className="flex min-h-0 flex-col gap-2">
          {currentStudent ? (
            <>
              <div className="shrink-0 rounded-lg border border-gray-200 bg-white px-3 py-2">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-base font-bold text-indigo-700">
                    {currentStudent.merit_rank}
                  </div>
                  <div className="min-w-0">
                    <h3 className="truncate text-base font-bold text-gray-900">{currentStudent.name}</h3>
                    <p className="truncate font-mono text-xs text-gray-500">{currentStudent.student_id}</p>
                  </div>
                </div>
                <p className="mt-2 text-[11px] leading-snug text-gray-500">
                  Pick a numbered card. It will reveal a supervisor and immediately assign them.
                </p>
              </div>

              <div className="flex min-h-0 flex-1 flex-col rounded-lg border border-gray-200 bg-white p-2">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-medium text-gray-600">Cards</span>
                  <span className="text-xs text-gray-500 tabular-nums">{cards}</span>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto">
                  <div className="grid min-h-full w-full grid-cols-[repeat(auto-fit,minmax(7.5rem,1fr))] gap-3 auto-rows-[minmax(6.5rem,1fr)] content-stretch">
                    {Array.from({ length: cards }, (_, i) => i + 1).map((n) => (
                      <button
                        key={n}
                        type="button"
                        disabled={pickMutation.isPending || Boolean(revealModal)}
                        onClick={() => pickMutation.mutate({ studentId: currentStudent.id, cardNumber: n })}
                        className="flex h-full min-h-[6.5rem] flex-col items-center justify-center rounded-xl border border-gray-200 bg-gradient-to-b from-slate-50 to-white text-center shadow-sm transition hover:border-indigo-300 hover:shadow disabled:opacity-60"
                      >
                        <span className="text-xs font-medium text-gray-500">Card</span>
                        <span className="mt-1 text-4xl font-black text-indigo-700 tabular-nums">{n}</span>
                      </button>
                    ))}
                    {cards === 0 && (
                      <div className="col-span-full rounded-lg border border-dashed border-gray-300 bg-gray-50 p-6 text-center text-sm text-gray-600">
                        No supervisors have lottery capacity remaining.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center rounded-lg border border-dashed border-gray-300 bg-gray-50/60 p-6 text-center">
              <h3 className="text-lg font-semibold text-gray-600">No current student</h3>
              <p className="mt-1 text-sm text-gray-500">
                {queue?.queue && queue.queue.length > 0 ? 'Preparing next student…' : 'All students have been processed.'}
              </p>
            </div>
          )}
        </div>

      {/* Supervisor Availability */}
        <aside className="flex min-h-0 flex-col rounded-lg border border-gray-200 bg-white p-2">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Capacity snapshot</h3>
          <div className="min-h-0 flex-1 overflow-y-auto space-y-2 pr-1">
            {supervisors?.filter((s) => s.is_available).map((sup: Supervisor) => {
              const remaining = remainingLotterySlotsDisplay(sup);
              return (
                <div key={sup.id} className="rounded-lg border border-gray-100 bg-gray-50 px-2 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-xs font-medium text-gray-900">{sup.name}</span>
                    <span className={`shrink-0 text-xs font-bold tabular-nums ${remaining > 0 ? 'text-green-700' : 'text-red-600'}`}>
                      {remaining}
                    </span>
                  </div>
                  <div className="mt-0.5 text-[10px] text-gray-500 truncate">{sup.designation}</div>
                  {usesSharedSingleSeat(sup) && (
                    <div className="mt-0.5 text-[10px] text-blue-700">Shared single seat</div>
                  )}
                </div>
              );
            })}
          </div>
        </aside>
      </div>
    </div>
  );
}
