'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Batch } from '@/lib/api';
import { batchesApi, sessionApi } from '@/lib/api';

export default function BatchesPage() {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');

  const { data: batches, isLoading } = useQuery({
    queryKey: ['batches'],
    queryFn: batchesApi.list,
  });

  const { data: session } = useQuery({
    queryKey: ['session'],
    queryFn: () => sessionApi.get(),
  });

  const createMutation = useMutation({
    mutationFn: async () => batchesApi.create(name.trim()),
    onSuccess: () => {
      setName('');
      queryClient.invalidateQueries({ queryKey: ['batches'] });
      queryClient.invalidateQueries({ queryKey: ['session'] });
      queryClient.invalidateQueries({ queryKey: ['students'] });
      queryClient.invalidateQueries({ queryKey: ['supervisors'] });
    },
    onError: (err: Error) => alert(err.message),
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

  if (isLoading) {
    return (
      <div className="flex justify-center py-16 text-gray-500">Loading...</div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-6 py-8">
      <h2 className="text-2xl font-bold mb-2">Cohort batches</h2>
      <p className="text-gray-600 text-sm mb-6">
        Each cohort has its own student list and ceremony state. Creating a batch makes it the working batch automatically.
        Switch the working cohort from Session Config—or here—only when no other batch is in choice or lottery.
      </p>

      <div className="bg-white border border-gray-200 rounded-lg p-6 mb-6">
        <h3 className="font-semibold mb-3">New batch</h3>
        <div className="flex gap-2 flex-wrap">
          <input
            className="border border-gray-300 rounded-md px-3 py-2 flex-1 min-w-[200px]"
            placeholder="e.g. Thesis 2026"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <button
            type="button"
            disabled={createMutation.isPending || !name.trim()}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50"
            onClick={() => createMutation.mutate()}
          >
            Create
          </button>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-700">Name</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-700">Created</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-700">Working</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-700">Actions</th>
            </tr>
          </thead>
          <tbody>
            {(batches ?? []).map((b: Batch) => {
              const isCurrent = session?.batch_id === b.id;
              return (
                <tr key={b.id} className="border-t border-gray-100">
                  <td className="px-4 py-3 font-medium">{b.name}</td>
                  <td className="px-4 py-3 text-sm text-gray-500">
                    {new Date(b.created_at).toLocaleString()}
                  </td>
                  <td className="px-4 py-3">
                    {isCurrent ? (
                      <span className="text-xs font-medium text-green-800 bg-green-100 px-2 py-1 rounded-full">
                        Current
                      </span>
                    ) : (
                      <span className="text-xs text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {!isCurrent && (
                      <button
                        type="button"
                        className="text-sm text-blue-600 hover:underline disabled:opacity-50"
                        disabled={setBatchMutation.isPending}
                        onClick={() => setBatchMutation.mutate(b.id)}
                      >
                        Set working
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
