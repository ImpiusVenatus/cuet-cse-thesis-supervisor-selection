'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supervisorsApi, Supervisor } from '@/lib/api';
import { Plus, Trash2, ToggleLeft, ToggleRight, Edit2 } from 'lucide-react';

const designations = ['Professor', 'Assoc. Prof.', 'Asst. Prof.', 'Lecturer'];

export default function SupervisorsPage() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    designation: 'Professor',
    email: '',
    total_capacity: 1,
    choice_capacity: 1,
    lottery_capacity: 0,
  });

  const { data: supervisors, isLoading } = useQuery({
    queryKey: ['supervisors'],
    queryFn: supervisorsApi.list,
  });

  const createMutation = useMutation({
    mutationFn: supervisorsApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['supervisors'] });
      resetForm();
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<Supervisor> }) =>
      supervisorsApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['supervisors'] });
      resetForm();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: supervisorsApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['supervisors'] });
    },
  });

  const toggleMutation = useMutation({
    mutationFn: supervisorsApi.toggleAvailability,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['supervisors'] });
    },
  });

  const resetForm = () => {
    setFormData({ name: '', designation: 'Professor', email: '', total_capacity: 1, choice_capacity: 1, lottery_capacity: 0 });
    setShowForm(false);
    setEditingId(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingId) {
      updateMutation.mutate({ id: editingId, data: formData });
    } else {
      createMutation.mutate(formData as any);
    }
  };

  const handleEdit = (sup: Supervisor) => {
    setFormData({
      name: sup.name,
      designation: sup.designation,
      email: sup.email || '',
      total_capacity: sup.total_capacity,
      choice_capacity: sup.choice_capacity,
      lottery_capacity: sup.lottery_capacity,
    });
    setEditingId(sup.id);
    setShowForm(true);
  };

  if (isLoading) return <div className="flex justify-center h-64 items-center text-gray-500">Loading...</div>;

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold">Supervisors</h2>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
        >
          <Plus className="w-4 h-4" /> Add Supervisor
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white border border-gray-200 rounded-lg p-6 mb-6">
          <h3 className="text-lg font-semibold mb-4">{editingId ? 'Edit' : 'Add'} Supervisor</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
              <input
                type="text"
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Designation *</label>
              <select
                value={formData.designation}
                onChange={(e) => setFormData({ ...formData, designation: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              >
                {designations.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Total Capacity *</label>
              <input
                type="number"
                required
                min={0}
                value={formData.total_capacity}
                onChange={(e) => setFormData({ ...formData, total_capacity: parseInt(e.target.value) })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Choice Capacity *</label>
              <input
                type="number"
                required
                min={0}
                value={formData.choice_capacity}
                onChange={(e) => setFormData({ ...formData, choice_capacity: parseInt(e.target.value) })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Lottery Capacity *</label>
              <input
                type="number"
                required
                min={0}
                value={formData.lottery_capacity}
                onChange={(e) => setFormData({ ...formData, lottery_capacity: parseInt(e.target.value) })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              />
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700">
              {editingId ? 'Update' : 'Create'}
            </button>
            <button type="button" onClick={resetForm} className="bg-gray-200 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-300">
              Cancel
            </button>
          </div>
        </form>
      )}

      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-700">Name</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-700">Designation</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-700">Total</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-700">Choice</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-700">Lottery</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-700">Available</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-700">Actions</th>
            </tr>
          </thead>
          <tbody>
            {supervisors?.map((sup) => (
              <tr key={sup.id} className="border-t border-gray-100 hover:bg-gray-50">
                <td className="px-4 py-3">
                  <div className="font-medium">{sup.name}</div>
                  {sup.email && <div className="text-sm text-gray-500">{sup.email}</div>}
                </td>
                <td className="px-4 py-3 text-sm">{sup.designation}</td>
                <td className="px-4 py-3">{sup.total_capacity}</td>
                <td className="px-4 py-3">
                  <span className={sup.choice_filled >= sup.choice_capacity ? 'text-red-600 font-medium' : 'text-green-600'}>
                    {sup.choice_filled}/{sup.choice_capacity}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className={sup.lottery_filled >= sup.lottery_capacity ? 'text-red-600 font-medium' : 'text-green-600'}>
                    {sup.lottery_filled}/{sup.lottery_capacity}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <button
                    onClick={() => toggleMutation.mutate(sup.id)}
                    className={`p-1 rounded ${sup.is_available ? 'text-green-600' : 'text-gray-400'}`}
                  >
                    {sup.is_available ? <ToggleRight className="w-6 h-6" /> : <ToggleLeft className="w-6 h-6" />}
                  </button>
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-2">
                    <button onClick={() => handleEdit(sup)} className="p-1 text-blue-600 hover:bg-blue-50 rounded">
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => {
                        if (confirm(`Delete ${sup.name}?`)) {
                          deleteMutation.mutate(sup.id);
                        }
                      }}
                      className="p-1 text-red-600 hover:bg-red-50 rounded"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {(!supervisors || supervisors.length === 0) && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                  No supervisors added yet. Click &quot;Add Supervisor&quot; to begin.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
