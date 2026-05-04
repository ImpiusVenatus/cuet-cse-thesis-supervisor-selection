'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { batchesApi, sessionApi } from '@/lib/api';
import { Play, AlertTriangle } from 'lucide-react';

export default function ConfigPage() {
  const queryClient = useQueryClient();
  const [totalStudents, setTotalStudents] = useState(100);
  const [choiceThreshold, setChoiceThreshold] = useState(20);
  const [resetPassword, setResetPassword] = useState('');
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  const { data: session, isLoading } = useQuery({
    queryKey: ['session'],
    queryFn: () => sessionApi.get(),
  });

  const { data: batches } = useQuery({
    queryKey: ['batches'],
    queryFn: batchesApi.list,
  });

  const setBatchMutation = useMutation({
    mutationFn: batchesApi.setCurrent,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['session'] });
      queryClient.invalidateQueries({ queryKey: ['students'] });
      queryClient.invalidateQueries({ queryKey: ['supervisors'] });
      queryClient.invalidateQueries({ queryKey: ['batches'] });
      queryClient.invalidateQueries({ queryKey: ['queue'] });
    },
    onError: (err: Error) => alert(err.message),
  });

  const setupMutation = useMutation({
    mutationFn: sessionApi.setup,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['session'] });
      queryClient.invalidateQueries({ queryKey: ['students'] });
      alert('Session configured successfully!');
    },
    onError: (err: Error) => alert(err.message),
  });

  const startChoiceMutation = useMutation({
    mutationFn: sessionApi.startChoice,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['session'] });
      alert('Choice phase started!');
    },
    onError: (err: Error) => alert(err.message),
  });

  const startLotteryMutation = useMutation({
    mutationFn: sessionApi.startLottery,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['session'] });
      alert('Lottery phase started!');
    },
    onError: (err: Error) => alert(err.message),
  });

  const completeMutation = useMutation({
    mutationFn: sessionApi.complete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['session'] });
      alert('Session completed!');
    },
    onError: (err: Error) => alert(err.message),
  });

  const resetMutation = useMutation({
    mutationFn: sessionApi.reset,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['session'] });
      queryClient.invalidateQueries({ queryKey: ['supervisors'] });
      queryClient.invalidateQueries({ queryKey: ['students'] });
      queryClient.invalidateQueries({ queryKey: ['batches'] });
      alert('Session reset successfully!');
      setShowResetConfirm(false);
      setResetPassword('');
    },
    onError: (err: Error) => alert(err.message),
  });

  const handleSetup = () => {
    if (totalStudents < 1 || choiceThreshold < 0) {
      alert('Invalid values');
      return;
    }
    setupMutation.mutate({ total_students: totalStudents, choice_threshold: choiceThreshold });
  };

  const phaseButtons: Record<string, { label: string; action: () => void; color: string; mutation: any }> = {
    setup: {
      label: 'Configure Session',
      action: handleSetup,
      color: 'bg-blue-600 hover:bg-blue-700',
      mutation: setupMutation,
    },
    choice_phase: {
      label: 'Start Lottery Phase',
      action: () => startLotteryMutation.mutate(),
      color: 'bg-orange-600 hover:bg-orange-700',
      mutation: startLotteryMutation,
    },
    lottery_phase: {
      label: 'Complete Session',
      action: () => completeMutation.mutate(),
      color: 'bg-green-600 hover:bg-green-700',
      mutation: completeMutation,
    },
    completed: {
      label: 'Session Complete',
      action: () => {},
      color: 'bg-gray-400',
      mutation: null,
    },
  };

  if (isLoading) return <div className="flex justify-center h-64 items-center text-gray-500">Loading...</div>;

  const currentPhase = session?.session_status || 'setup';
  const currentButton = phaseButtons[currentPhase];

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      <h2 className="text-2xl font-bold mb-6">Session Configuration</h2>

      <div className="bg-white border border-gray-200 rounded-lg p-6 mb-6">
        <h3 className="text-lg font-semibold mb-2">Working cohort (batch)</h3>
        <p className="text-sm text-gray-500 mb-3">
          Imports, supervisor slot counts, and the ceremony all apply to this batch only. Batch switching is blocked
          while another cohort is mid–choice/lottery.
        </p>
        <div className="flex flex-wrap gap-3 items-center">
          <select
            className="border border-gray-300 rounded-md px-3 py-2 min-w-[220px]"
            value={session?.batch_id ?? ''}
            disabled={!batches?.length || setBatchMutation.isPending}
            onChange={(e) => {
              const id = Number(e.target.value);
              if (id) setBatchMutation.mutate(id);
            }}
          >
            {batches?.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
          <a href="/setup/batches" className="text-sm text-blue-600 hover:underline">
            Manage batches
          </a>
        </div>
      </div>

      {/* Current Session Info */}
      <div className="bg-white border border-gray-200 rounded-lg p-6 mb-6">
        <h3 className="text-lg font-semibold mb-4">Current Session</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <div className="text-sm text-gray-500">Status</div>
            <div className="text-lg font-bold capitalize">{currentPhase.replace('_', ' ')}</div>
          </div>
          <div>
            <div className="text-sm text-gray-500">Total Students</div>
            <div className="text-lg font-bold">{session?.total_students || 0}</div>
          </div>
          <div>
            <div className="text-sm text-gray-500">Choice Threshold</div>
            <div className="text-lg font-bold">{session?.choice_threshold || 0}</div>
          </div>
          <div>
            <div className="text-sm text-gray-500">Current Rank</div>
            <div className="text-lg font-bold">{session?.current_choice_rank || 1}</div>
          </div>
        </div>
      </div>

      {/* Setup Form */}
      {currentPhase === 'setup' && (
        <div className="bg-white border border-gray-200 rounded-lg p-6 mb-6">
          <h3 className="text-lg font-semibold mb-4">Configure Session</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Total Students</label>
              <input
                type="number"
                min={1}
                value={totalStudents}
                onChange={(e) => setTotalStudents(parseInt(e.target.value))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Choice Threshold (Top-N get choice privilege)
              </label>
              <input
                type="number"
                min={0}
                value={choiceThreshold}
                onChange={(e) => setChoiceThreshold(parseInt(e.target.value))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              />
            </div>
          </div>
          <p className="text-sm text-gray-500 mt-3">
            Students with merit rank 1-{choiceThreshold} will get to choose their supervisor.
            Remaining students will be assigned via lottery.
          </p>
          <button
            onClick={handleSetup}
            disabled={setupMutation.isPending}
            className={`mt-4 text-white px-4 py-2 rounded-lg ${currentButton.color} disabled:opacity-50`}
          >
            <Play className="w-4 h-4 inline mr-1" /> Configure &amp; Save
          </button>

          <div className="mt-8 pt-6 border-t border-gray-200">
            <h4 className="text-md font-semibold mb-2">Begin ceremony</h4>
            <p className="text-sm text-gray-500 mb-3">
              After saving configuration, start the choice phase so students with choice privilege pick supervisors in merit order.
            </p>
            <button
              type="button"
              onClick={() => startChoiceMutation.mutate()}
              disabled={
                startChoiceMutation.isPending ||
                !session ||
                session.total_students < 1
              }
              className="text-white px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Play className="w-4 h-4 inline mr-1" /> Start Choice Phase
            </button>
            {session && session.total_students < 1 && (
              <p className="text-xs text-amber-600 mt-2">
                Save session configuration first (total students must be at least 1).
              </p>
            )}
          </div>
        </div>
      )}

      {/* Phase Transition Buttons */}
      {currentPhase !== 'setup' && (
        <div className="bg-white border border-gray-200 rounded-lg p-6 mb-6">
          <h3 className="text-lg font-semibold mb-4">Phase Control</h3>
          <button
            onClick={currentButton.action}
            disabled={currentButton.mutation?.isPending || currentPhase === 'completed'}
            className={`text-white px-4 py-2 rounded-lg ${currentButton.color} disabled:opacity-50`}
          >
            {currentButton.label}
          </button>
        </div>
      )}

      {/* Reset Section */}
      <div className="bg-white border border-red-200 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-red-600 mb-4 flex items-center gap-2">
          <AlertTriangle className="w-5 h-5" /> Danger Zone
        </h3>
        {!showResetConfirm ? (
          <button
            onClick={() => setShowResetConfirm(true)}
            className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700"
          >
            Reset Session
          </button>
        ) : (
          <div>
            <p className="text-sm text-gray-600 mb-3">
              This clears assignments for the working batch, resets that batch&apos;s per-supervisor slot usage, and clears
              all students linked to this batch (session returns to setup). Enter the reset password to confirm.
            </p>
            <div className="flex gap-2">
              <input
                type="password"
                value={resetPassword}
                onChange={(e) => setResetPassword(e.target.value)}
                placeholder="Reset password"
                className="px-3 py-2 border border-gray-300 rounded-md"
              />
              <button
                onClick={() => resetMutation.mutate(resetPassword)}
                disabled={resetMutation.isPending || !resetPassword}
                className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 disabled:opacity-50"
              >
                Confirm Reset
              </button>
              <button
                onClick={() => { setShowResetConfirm(false); setResetPassword(''); }}
                className="bg-gray-200 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-300"
              >
                Cancel
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-2">Default password: reset2026</p>
          </div>
        )}
      </div>
    </div>
  );
}
