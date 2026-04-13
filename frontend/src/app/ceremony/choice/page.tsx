'use client';

import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { allocationApi, supervisorsApi, studentsApi, Student, Supervisor } from '@/lib/api';
import { CheckCircle, XCircle, SkipForward, AlertCircle } from 'lucide-react';

export default function ChoicePage() {
  const queryClient = useQueryClient();
  const [selectedSupervisor, setSelectedSupervisor] = useState<number | null>(null);
  const [confirmAction, setConfirmAction] = useState<{ type: 'choose' | 'forfeit'; studentId: number } | null>(null);
  const [wsMessage, setWsMessage] = useState<string>('');

  const { data: queue, isLoading: queueLoading } = useQuery({
    queryKey: ['queue'],
    queryFn: allocationApi.getQueue,
    refetchInterval: 3000,
  });

  const { data: supervisors } = useQuery({
    queryKey: ['supervisors'],
    queryFn: supervisorsApi.list,
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
      setWsMessage(`Assigned ${data.student?.name || ''} to ${data.supervisor?.name || ''}`);
      setTimeout(() => setWsMessage(''), 3000);
    },
    onError: (err: Error) => alert(err.message),
  });

  const forfeitMutation = useMutation({
    mutationFn: allocationApi.forfeit,
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['queue'] });
      queryClient.invalidateQueries({ queryKey: ['students'] });
      setWsMessage(`${data.student?.name || ''} has forfeited`);
      setTimeout(() => setWsMessage(''), 3000);
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

  const availableSupervisors = supervisors?.filter(
    (s) => s.is_available && s.choice_filled < s.choice_capacity
  ) || [];

  if (queueLoading) {
    return <div className="flex justify-center h-64 items-center text-gray-500">Loading...</div>;
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
    <div className="max-w-7xl mx-auto px-6 py-8">
      <h2 className="text-2xl font-bold mb-4">Choice Phase</h2>

      {/* WebSocket Message */}
      {wsMessage && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-3 mb-4 text-green-800">
          {wsMessage}
        </div>
      )}

      {/* Current Student */}
      {currentStudent ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white border border-gray-200 rounded-lg p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 font-bold text-xl">
                {currentStudent.merit_rank}
              </div>
              <div>
                <h3 className="text-xl font-bold">{currentStudent.name}</h3>
                <p className="text-sm text-gray-500">{currentStudent.student_id}</p>
              </div>
            </div>

            <div className="space-y-3 mt-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Select Supervisor</label>
                <div className="space-y-2 max-h-80 overflow-y-auto">
                  {availableSupervisors.map((sup) => {
                    const remaining = sup.choice_capacity - sup.choice_filled;
                    return (
                      <button
                        key={sup.id}
                        onClick={() => setSelectedSupervisor(sup.id)}
                        className={`w-full text-left p-3 border rounded-lg transition ${
                          selectedSupervisor === sup.id
                            ? 'border-blue-500 bg-blue-50'
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <div className="font-medium">{sup.name}</div>
                        <div className="text-sm text-gray-500">
                          {sup.designation} &middot; {remaining} slot{remaining !== 1 ? 's' : ''} remaining
                        </div>
                      </button>
                    );
                  })}
                  {availableSupervisors.length === 0 && (
                    <p className="text-gray-500 text-center py-4">No supervisors with available choice slots</p>
                  )}
                </div>
              </div>

              <button
                onClick={handleChoose}
                disabled={!selectedSupervisor || chooseMutation.isPending}
                className="w-full flex items-center justify-center gap-2 bg-green-600 text-white px-4 py-3 rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <CheckCircle className="w-5 h-5" /> Confirm Choice
              </button>

              <div className="flex gap-2">
                <button
                  onClick={() => setConfirmAction({ type: 'forfeit', studentId: currentStudent.id })}
                  disabled={forfeitMutation.isPending}
                  className="flex-1 flex items-center justify-center gap-2 bg-red-100 text-red-700 px-4 py-2 rounded-lg hover:bg-red-200 disabled:opacity-50"
                >
                  <XCircle className="w-4 h-4" /> Forfeit
                </button>
                <button
                  onClick={handleSkip}
                  disabled={skipMutation.isPending}
                  className="flex-1 flex items-center justify-center gap-2 bg-gray-100 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-200 disabled:opacity-50"
                >
                  <SkipForward className="w-4 h-4" /> Skip
                </button>
              </div>
            </div>
          </div>

          {/* Queue Sidebar */}
          <div className="bg-white border border-gray-200 rounded-lg p-6">
            <h3 className="text-lg font-semibold mb-4">Upcoming Queue</h3>
            <div className="space-y-2">
              {queue?.queue?.slice(0, 10).map((student: Student) => (
                <div key={student.id} className="flex items-center gap-3 p-2 bg-gray-50 rounded">
                  <span className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center text-sm font-mono">
                    {student.merit_rank}
                  </span>
                  <div>
                    <div className="text-sm font-medium">{student.name}</div>
                    <div className="text-xs text-gray-500">{student.student_id}</div>
                  </div>
                </div>
              ))}
              {(!queue?.queue || queue.queue.length === 0) && (
                <p className="text-gray-500 text-sm">No more students in queue</p>
              )}
            </div>

            {queue?.forfeited_students && queue.forfeited_students.length > 0 && (
              <>
                <h4 className="text-sm font-semibold text-red-600 mt-6 mb-2">Forfeited Students</h4>
                <div className="space-y-2">
                  {queue.forfeited_students.map((student: Student) => (
                    <div key={student.id} className="flex items-center gap-3 p-2 bg-red-50 rounded">
                      <XCircle className="w-4 h-4 text-red-600" />
                      <div>
                        <div className="text-sm font-medium">{student.name}</div>
                        <div className="text-xs text-gray-500">Rank {student.merit_rank} &middot; Forfeit #{student.forfeit_order}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-lg p-12 text-center">
          <h3 className="text-xl font-semibold text-gray-600">No current student</h3>
          <p className="text-gray-500 mt-2">
            {queue?.queue && queue.queue.length > 0
              ? 'Processing next student...'
              : 'All students have been processed!'}
          </p>
        </div>
      )}

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
