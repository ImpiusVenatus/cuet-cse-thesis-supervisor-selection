'use client';

import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  allocationApi,
  supervisorsApi,
  Student,
  Supervisor,
  sessionApi,
  SESSION_RESET_PASSWORD,
} from '@/lib/api';
import {
  supervisorHasChoiceRoom,
  remainingChoiceSlotsDisplay,
  remainingLotterySlotsDisplay,
} from '@/lib/supervisorCapacity';
import { CheckCircle, XCircle, SkipForward, AlertCircle, Loader2, Wrench } from 'lucide-react';

/** Same order as supervisor setup: Professor → Assoc. → Asst. → Lecturer. */
const DESIGNATION_RANK: Record<string, number> = {
  Professor: 0,
  'Assoc. Prof.': 1,
  'Asst. Prof.': 2,
  Lecturer: 3,
};

function designationRank(des: string): number {
  return DESIGNATION_RANK[des] ?? 99;
}

export default function ChoicePage() {
  const queryClient = useQueryClient();
  const [selectedSupervisor, setSelectedSupervisor] = useState<number | null>(null);
  const [confirmAction, setConfirmAction] = useState<{ type: 'choose' | 'forfeit'; studentId: number } | null>(null);
  const [assignmentSuccessModal, setAssignmentSuccessModal] = useState<{
    studentName: string;
    supervisorName: string;
  } | null>(null);
  const [forfeitSuccessModal, setForfeitSuccessModal] = useState<{ studentName: string } | null>(null);
  const [wsMessage, setWsMessage] = useState<string>('');

  const { data: queue, isPending: queuePending } = useQuery({
    queryKey: ['queue'],
    queryFn: allocationApi.getQueue,
    refetchInterval: 3000,
  });

  const { data: supervisors, isPending: supervisorsPending } = useQuery({
    queryKey: ['supervisors'],
    queryFn: () => supervisorsApi.list(),
    refetchInterval: 3000,
  });

  const currentStudent = queue?.current_student as (Student & { supervisor_name?: string | null }) | null | undefined;

  const chooseMutation = useMutation({
    mutationFn: ({ studentId, supervisorId }: { studentId: number; supervisorId: number }) =>
      allocationApi.choose(studentId, supervisorId),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['queue'] });
      queryClient.invalidateQueries({ queryKey: ['supervisors'] });
      queryClient.invalidateQueries({ queryKey: ['students'] });
      setSelectedSupervisor(null);
      setAssignmentSuccessModal({
        studentName: data.student?.name ?? 'Student',
        supervisorName: data.supervisor?.name ?? 'Supervisor',
      });
    },
    onError: (err: Error) => alert(err.message),
  });

  const forfeitMutation = useMutation({
    mutationFn: allocationApi.forfeit,
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['queue'] });
      queryClient.invalidateQueries({ queryKey: ['students'] });
      setForfeitSuccessModal({ studentName: data.student?.name ?? 'Student' });
    },
    onError: (err: Error) => alert(err.message),
  });

  const skipMutation = useMutation({
    mutationFn: allocationApi.skip,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['queue'] });
      setWsMessage('Student skipped');
      setTimeout(() => setWsMessage(''), 3000);
    },
    onError: (err: Error) => alert(err.message),
  });

  /** Temporary: full batch reset to setup only — start choice again from Session Config when ready. */
  const devResetSessionMutation = useMutation({
    mutationFn: () => sessionApi.reset(SESSION_RESET_PASSWORD),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['session'] });
      queryClient.invalidateQueries({ queryKey: ['queue'] });
      queryClient.invalidateQueries({ queryKey: ['students'] });
      queryClient.invalidateQueries({ queryKey: ['supervisors'] });
      setSelectedSupervisor(null);
      setWsMessage('Session reset — use Session Config to start the choice phase again.');
      setTimeout(() => setWsMessage(''), 5000);
    },
    onError: (err: Error) => alert(err.message),
  });

  const handleChoose = () => {
    if (!currentStudent || !selectedSupervisor) return;
    chooseMutation.mutate({ studentId: currentStudent.id, supervisorId: selectedSupervisor });
  };

  const handleForfeit = () => {
    if (!currentStudent) return;
    forfeitMutation.mutate(currentStudent.id);
  };

  const handleSkip = () => {
    if (!currentStudent) return;
    skipMutation.mutate(currentStudent.id);
  };

  const availableSupervisorsSorted = useMemo(() => {
    const list = supervisors?.filter((s) => supervisorHasChoiceRoom(s)) ?? [];
    return [...list].sort((a, b) => {
      const ra = designationRank(a.designation);
      const rb = designationRank(b.designation);
      if (ra !== rb) return ra - rb;
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
    });
  }, [supervisors]);

  const waitingForCeremony =
    (queuePending && queue === undefined) || (supervisorsPending && supervisors === undefined);

  if (waitingForCeremony) {
    return (
      <div className="flex h-[100dvh] flex-col items-center justify-center gap-3 text-gray-500">
        <Loader2 className="h-10 w-10 animate-spin text-blue-600" aria-hidden />
        <p>Loading ceremony…</p>
      </div>
    );
  }

  if (queue?.phase !== 'choice_phase') {
    return (
      <div className="max-w-4xl mx-auto px-6 py-8">
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 text-center">
          <AlertCircle className="w-12 h-12 text-yellow-600 mx-auto mb-3" />
          <h3 className="text-lg font-semibold text-yellow-800">Not in Choice Phase</h3>
          <p className="text-yellow-600 mt-2">
            Current phase: {queue?.phase?.replace('_', ' ') || 'unknown'}. Go to Config to start the choice phase.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-[100dvh] max-h-[100dvh] flex-col overflow-hidden px-4 py-3">
      <div className="mb-2 shrink-0 rounded-lg border border-amber-300/80 bg-amber-50 px-3 py-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-start gap-2 text-xs text-amber-950 min-w-0">
          <Wrench className="w-4 h-4 shrink-0 text-amber-700 mt-0.5" aria-hidden />
          <span>
            <strong className="font-semibold">Dev:</strong> reset batch to setup — start choice again from Config.
          </span>
        </div>
        <button
          type="button"
          disabled={
            devResetSessionMutation.isPending ||
            chooseMutation.isPending ||
            forfeitMutation.isPending ||
            skipMutation.isPending
          }
          onClick={() => devResetSessionMutation.mutate()}
          className="inline-flex items-center gap-2 shrink-0 rounded-md bg-amber-700 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-amber-800 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {devResetSessionMutation.isPending ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden />
          ) : null}
          Reset session
        </button>
      </div>

      <div className="mb-2 flex shrink-0 flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-xl font-bold text-gray-900">Choice Phase</h2>
      </div>

      {wsMessage && (
        <div className="mb-2 shrink-0 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
          {wsMessage}
        </div>
      )}

      {assignmentSuccessModal && (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center bg-black/45 p-4"
          role="presentation"
          onClick={() => setAssignmentSuccessModal(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="assignment-success-title"
            className="w-full max-w-md rounded-xl border border-green-200 bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex flex-col items-center text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-green-100">
                <CheckCircle className="h-8 w-8 text-green-600" aria-hidden />
              </div>
              <h3 id="assignment-success-title" className="mt-4 text-xl font-semibold text-gray-900">
                Supervisor assigned
              </h3>
              <p className="mt-3 text-sm leading-relaxed text-gray-600">
                <span className="font-semibold text-gray-900">{assignmentSuccessModal.studentName}</span>
                {' '}is now supervised by{' '}
                <span className="font-semibold text-gray-900">{assignmentSuccessModal.supervisorName}</span>.
              </p>
              <button
                type="button"
                onClick={() => setAssignmentSuccessModal(null)}
                className="mt-6 w-full rounded-lg bg-green-600 px-4 py-3 text-sm font-semibold text-white hover:bg-green-700"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}

      {forfeitSuccessModal && (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center bg-black/45 p-4"
          role="presentation"
          onClick={() => setForfeitSuccessModal(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="forfeit-success-title"
            className="w-full max-w-md rounded-xl border border-amber-200 bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex flex-col items-center text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-amber-100">
                <XCircle className="h-8 w-8 text-amber-700" aria-hidden />
              </div>
              <h3 id="forfeit-success-title" className="mt-4 text-xl font-semibold text-gray-900">
                Choice forfeited
              </h3>
              <p className="mt-3 text-sm leading-relaxed text-gray-600">
                <span className="font-semibold text-gray-900">{forfeitSuccessModal.studentName}</span>
                {' '}has forfeited their choice slot. They will be placed in the lottery queue with priority.
              </p>
              <button
                type="button"
                onClick={() => setForfeitSuccessModal(null)}
                className="mt-6 w-full rounded-lg bg-amber-700 px-4 py-3 text-sm font-semibold text-white hover:bg-amber-800"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="grid min-h-0 flex-1 grid-cols-1 items-stretch gap-3 lg:grid-cols-[minmax(0,1fr)_11rem] xl:grid-cols-[minmax(0,1fr)_12rem]">
        <div className="flex min-h-0 min-w-0 flex-col gap-2">
          {currentStudent ? (
            <>
              <div className="shrink-0 rounded-lg border border-gray-200 bg-white px-3 py-2">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-100 text-base font-bold text-blue-700">
                    {currentStudent.merit_rank}
                  </div>
                  <div className="min-w-0">
                    <h3 className="truncate text-base font-bold text-gray-900">{currentStudent.name}</h3>
                    <p className="truncate font-mono text-xs text-gray-500">{currentStudent.student_id}</p>
                  </div>
                </div>
              </div>

              <div className="flex min-h-0 flex-1 flex-col rounded-lg border border-gray-200 bg-white p-2">
                <span className="mb-2 block text-xs font-medium text-gray-600">Supervisors with choice slots</span>
                <div className="min-h-0 flex-1 overflow-y-auto">
                  <div
                    className="grid min-h-full w-full grid-cols-[repeat(auto-fit,minmax(12rem,1fr))] gap-3 auto-rows-[minmax(7.25rem,1fr)] content-stretch"
                  >
                    {availableSupervisorsSorted.map((sup) => {
                      const choiceLeft = remainingChoiceSlotsDisplay(sup);
                      const lotteryLeft = remainingLotterySlotsDisplay(sup);
                      return (
                        <button
                          key={sup.id}
                          type="button"
                          onClick={() => setSelectedSupervisor(sup.id)}
                          className={`flex h-full min-h-[7.25rem] flex-col items-center rounded-lg border p-4 text-center shadow-sm transition ${
                            selectedSupervisor === sup.id
                              ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-400/60'
                              : 'border-gray-200 bg-gray-50/90 hover:border-gray-300 hover:bg-white'
                          }`}
                        >
                          <span className="line-clamp-3 w-full text-base font-semibold leading-snug text-gray-900 sm:text-lg">
                            {sup.name}
                          </span>
                          <span className="mt-1 line-clamp-1 w-full text-xs text-gray-600 sm:text-sm">{sup.designation}</span>
                          <div className="mt-auto flex w-full items-end justify-between border-t border-gray-200/90 pt-3">
                            <span
                              className="text-2xl font-bold tabular-nums leading-none text-violet-600 sm:text-3xl"
                              title="Choice slots remaining"
                            >
                              {choiceLeft}
                            </span>
                            <span
                              className="text-2xl font-bold tabular-nums leading-none text-amber-600 sm:text-3xl"
                              title="Lottery slots remaining"
                            >
                              {lotteryLeft}
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                  {availableSupervisorsSorted.length === 0 && (
                    <p className="py-8 text-center text-sm text-gray-500">No supervisors with available choice slots</p>
                  )}
                </div>
              </div>

              <div className="flex shrink-0 flex-col gap-2">
                <div className="grid min-w-0 grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={handleChoose}
                    disabled={!selectedSupervisor || chooseMutation.isPending}
                    className="flex min-w-0 items-center justify-center gap-2 rounded-lg bg-green-600 px-3 py-2.5 text-sm font-semibold text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {chooseMutation.isPending ? (
                      <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden />
                    ) : (
                      <CheckCircle className="h-4 w-4 shrink-0" aria-hidden />
                    )}
                    Confirm choice
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmAction({ type: 'forfeit', studentId: currentStudent.id })}
                    disabled={forfeitMutation.isPending}
                    className="flex min-w-0 items-center justify-center gap-1.5 rounded-lg bg-red-100 px-3 py-2.5 text-sm font-medium text-red-800 hover:bg-red-200 disabled:opacity-50"
                  >
                    <XCircle className="h-4 w-4 shrink-0" aria-hidden /> Forfeit
                  </button>
                </div>
                <button
                  type="button"
                  onClick={handleSkip}
                  disabled={skipMutation.isPending}
                  className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-gray-100 px-3 py-2 text-sm font-medium text-gray-800 hover:bg-gray-200 disabled:opacity-50"
                >
                  <SkipForward className="h-4 w-4 shrink-0" aria-hidden /> Skip
                </button>
              </div>
            </>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center rounded-lg border border-dashed border-gray-300 bg-gray-50/60 p-6 text-center">
              <h3 className="text-lg font-semibold text-gray-600">No current student</h3>
              <p className="mt-1 text-sm text-gray-500">
                {queue?.queue && queue.queue.length > 0
                  ? 'Processing next student…'
                  : 'All students have been processed.'}
              </p>
            </div>
          )}
        </div>

        <aside className="flex max-h-[42vh] min-h-0 flex-col rounded-lg border border-gray-200 bg-white p-2 lg:max-h-none lg:h-full">
          <h3 className="mb-1 shrink-0 text-[11px] font-semibold uppercase tracking-wide text-gray-500">Up next</h3>
          <div className="min-h-0 flex-1 space-y-1 overflow-y-auto pr-0.5">
            {queue?.queue?.map((student: Student) => (
              <div key={student.id} className="flex items-center gap-1.5 rounded bg-gray-50 px-1.5 py-1">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gray-200 text-[10px] font-mono font-semibold text-gray-800">
                  {student.merit_rank}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[11px] font-medium leading-tight text-gray-900">{student.name}</div>
                  <div className="truncate font-mono text-[9px] text-gray-500">{student.student_id}</div>
                </div>
              </div>
            ))}
            {(!queue?.queue || queue.queue.length === 0) && (
              <p className="py-2 text-center text-[10px] text-gray-500">Queue empty</p>
            )}
          </div>

          {queue?.forfeited_students && queue.forfeited_students.length > 0 && (
            <div className="mt-2 shrink-0 border-t border-gray-100 pt-2">
              <h4 className="mb-1 text-[10px] font-semibold uppercase text-red-600">Forfeited</h4>
              <div className="max-h-24 space-y-1 overflow-y-auto">
                {queue.forfeited_students.map((student: Student) => (
                  <div key={student.id} className="flex items-start gap-1 rounded bg-red-50 px-1 py-0.5">
                    <XCircle className="mt-0.5 h-3 w-3 shrink-0 text-red-600" aria-hidden />
                    <div className="min-w-0">
                      <div className="truncate text-[10px] font-medium text-red-950">{student.name}</div>
                      <div className="text-[9px] text-red-800/80">
                        R{student.merit_rank} · #{student.forfeit_order}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </aside>
      </div>

      {/* Forfeit Confirmation Modal */}
      {confirmAction?.type === 'forfeit' && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-bold mb-3">Confirm Forfeit</h3>
            <p className="text-gray-600 mb-4">
              This student will lose their choice privilege and be assigned during the lottery phase.
              They will get priority in the lottery queue.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => { handleForfeit(); setConfirmAction(null); }}
                className="flex-1 bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700"
              >
                Yes, Forfeit
              </button>
              <button
                onClick={() => setConfirmAction(null)}
                className="flex-1 bg-gray-200 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-300"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
