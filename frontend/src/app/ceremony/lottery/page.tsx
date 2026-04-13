'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { allocationApi, supervisorsApi, Student, Supervisor } from '@/lib/api';
import { Play, CheckCircle, AlertCircle } from 'lucide-react';

export default function LotteryPage() {
  const queryClient = useQueryClient();
  const [lotteryResults, setLotteryResults] = useState<any[]>([]);
  const [showConfirm, setShowConfirm] = useState(false);

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

  const runLotteryMutation = useMutation({
    mutationFn: allocationApi.runLottery,
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['queue'] });
      queryClient.invalidateQueries({ queryKey: ['supervisors'] });
      queryClient.invalidateQueries({ queryKey: ['students'] });
      queryClient.invalidateQueries({ queryKey: ['session'] });
      setLotteryResults(data.assignments || []);
      setShowConfirm(false);
    },
    onError: (err: Error) => alert(err.message),
  });

  const handleRunLottery = () => {
    runLotteryMutation.mutate('auto');
  };

  if (queueLoading) {
    return <div className="flex justify-center h-64 items-center text-gray-500">Loading...</div>;
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

  const queueStudents = queue?.queue || [];
  const forfeitedStudents = queue?.forfeited_students || [];

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      <h2 className="text-2xl font-bold mb-4">Lottery Phase</h2>

      {/* Run Lottery Button */}
      <div className="bg-white border border-gray-200 rounded-lg p-6 mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold">Ready to Run Lottery</h3>
            <p className="text-sm text-gray-500 mt-1">
              {queueStudents.length} students will be assigned to available supervisors
            </p>
          </div>
          <button
            onClick={() => setShowConfirm(true)}
            disabled={runLotteryMutation.isPending || queueStudents.length === 0}
            className="flex items-center gap-2 bg-green-600 text-white px-6 py-3 rounded-lg hover:bg-green-700 disabled:opacity-50"
          >
            <Play className="w-5 h-5" /> Run Lottery
          </button>
        </div>
      </div>

      {/* Lottery Queue */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Forfeited Students (Priority) */}
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <h3 className="text-lg font-semibold mb-4 text-red-600">
            Forfeited Students (Priority Queue)
          </h3>
          {forfeitedStudents.length > 0 ? (
            <div className="space-y-2">
              {forfeitedStudents.map((student: Student) => (
                <div key={student.id} className="flex items-center gap-3 p-3 bg-red-50 rounded-lg">
                  <span className="w-8 h-8 bg-red-200 rounded-full flex items-center justify-center text-sm font-mono text-red-800">
                    {student.forfeit_order}
                  </span>
                  <div>
                    <div className="font-medium">{student.name}</div>
                    <div className="text-sm text-gray-500">Rank #{student.merit_rank}</div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-500 text-center py-4">No forfeited students</p>
          )}
        </div>

        {/* Regular Queue */}
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <h3 className="text-lg font-semibold mb-4">Remaining Students</h3>
          {queueStudents.length > 0 ? (
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {queueStudents.map((student: Student) => (
                <div key={student.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                  <span className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center text-sm font-mono">
                    {student.merit_rank}
                  </span>
                  <div>
                    <div className="font-medium">{student.name}</div>
                    <div className="text-sm text-gray-500">Rank #{student.merit_rank}</div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-500 text-center py-4">No remaining students</p>
          )}
        </div>
      </div>

      {/* Supervisor Availability */}
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <h3 className="text-lg font-semibold mb-4">Supervisor Lottery Availability</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {supervisors?.filter(s => s.is_available).map((sup: Supervisor) => {
            const lotteryRemaining = sup.lottery_capacity - sup.lottery_filled;
            return (
              <div key={sup.id} className="p-3 border border-gray-200 rounded-lg">
                <div className="font-medium">{sup.name}</div>
                <div className="text-sm text-gray-500">{sup.designation}</div>
                <div className="mt-2">
                  <span className={`text-sm font-medium ${lotteryRemaining > 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {lotteryRemaining} lottery slots remaining
                  </span>
                </div>
                <div className="text-xs text-gray-400 mt-1">
                  Choice: {sup.choice_filled}/{sup.choice_capacity} | Lottery: {sup.lottery_filled}/{sup.lottery_capacity}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Lottery Results */}
      {lotteryResults.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-lg p-6 mt-6">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <CheckCircle className="w-5 h-5 text-green-600" />
            Lottery Results ({lotteryResults.length} assignments)
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 text-sm font-medium text-gray-700">Student</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-gray-700">Rank</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-gray-700">Supervisor</th>
                </tr>
              </thead>
              <tbody>
                {lotteryResults.map((result: any) => (
                  <tr key={result.student_id} className="border-t border-gray-100">
                    <td className="px-4 py-3 font-medium">{result.student_name}</td>
                    <td className="px-4 py-3 font-mono">{result.merit_rank}</td>
                    <td className="px-4 py-3">{result.supervisor_name}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      {showConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-bold mb-3">Confirm Lottery Run</h3>
            <p className="text-gray-600 mb-4">
              This will automatically assign {queueStudents.length} students to available supervisors
              based on the lottery queue order. This action cannot be easily undone.
            </p>
            <div className="flex gap-2">
              <button
                onClick={handleRunLottery}
                className="flex-1 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700"
              >
                Yes, Run Lottery
              </button>
              <button
                onClick={() => setShowConfirm(false)}
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
