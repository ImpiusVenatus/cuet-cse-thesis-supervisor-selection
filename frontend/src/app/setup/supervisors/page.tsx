'use client';

import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supervisorsApi, Supervisor } from '@/lib/api';
import {
  usesSharedSingleSeat,
  combinedFilled,
  usesPartitionedCapacities,
  syncPartitionFromChoice,
  syncPartitionFromLottery,
  syncPartitionFromTotal,
  normalizePartitionForForm,
} from '@/lib/supervisorCapacity';
import {
  Plus,
  Trash2,
  ToggleLeft,
  ToggleRight,
  Edit2,
  Info,
  ArrowUp,
  ArrowDown,
  Loader2,
} from 'lucide-react';

const designations = ['Professor', 'Assoc. Prof.', 'Asst. Prof.', 'Lecturer'];

const DESIGNATION_RANK: Record<string, number> = {
  Professor: 0,
  'Assoc. Prof.': 1,
  'Asst. Prof.': 2,
  Lecturer: 3,
};

function designationRank(des: string): number {
  return DESIGNATION_RANK[des] ?? 99;
}

function readNonNegInt(raw: string, fallback: number) {
  if (raw === '') return fallback;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) ? Math.max(0, n) : fallback;
}

type SupervisorFormState = {
  name: string;
  designation: string;
  email: string;
  total_capacity: number;
  choice_capacity: number;
  lottery_capacity: number;
};

function emptySupervisorForm(): SupervisorFormState {
  return {
    name: '',
    designation: 'Professor',
    email: '',
    total_capacity: 1,
    choice_capacity: 1,
    lottery_capacity: 1,
  };
}

function SupervisorFormFields(props: {
  formData: SupervisorFormState;
  setFormData: React.Dispatch<React.SetStateAction<SupervisorFormState>>;
  title: string;
  headingId?: string;
  disabled?: boolean;
}) {
  const { formData, setFormData, title, headingId, disabled } = props;
  return (
    <>
      <div className="flex items-center gap-2 mb-4">
        <h3 id={headingId} className="text-lg font-semibold">
          {title}
        </h3>
        <CapacityQuotaInfoTip
          total_capacity={formData.total_capacity}
          choice_capacity={formData.choice_capacity}
          lottery_capacity={formData.lottery_capacity}
        />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
          <input
            type="text"
            required
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            disabled={disabled}
            className="w-full px-3 py-2 border border-gray-300 rounded-md disabled:bg-gray-50"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Designation *</label>
          <select
            value={formData.designation}
            onChange={(e) => setFormData({ ...formData, designation: e.target.value })}
            disabled={disabled}
            className="w-full px-3 py-2 border border-gray-300 rounded-md disabled:bg-gray-50"
          >
            {designations.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
          <input
            type="email"
            value={formData.email}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            disabled={disabled}
            className="w-full px-3 py-2 border border-gray-300 rounded-md disabled:bg-gray-50"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Total Capacity *</label>
          <input
            type="number"
            required
            min={0}
            value={formData.total_capacity}
            onChange={(e) => {
              const total = readNonNegInt(e.target.value, formData.total_capacity);
              if (!usesPartitionedCapacities(total)) {
                setFormData({ ...formData, total_capacity: total });
                return;
              }
              const { choice_capacity, lottery_capacity } = syncPartitionFromTotal(
                total,
                formData.choice_capacity,
              );
              setFormData({ ...formData, total_capacity: total, choice_capacity, lottery_capacity });
            }}
            disabled={disabled}
            className="w-full px-3 py-2 border border-gray-300 rounded-md disabled:bg-gray-50"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Choice Capacity *</label>
          <input
            type="number"
            required
            min={0}
            value={formData.choice_capacity}
            onChange={(e) => {
              const choice = readNonNegInt(e.target.value, formData.choice_capacity);
              if (!usesPartitionedCapacities(formData.total_capacity)) {
                setFormData({ ...formData, choice_capacity: choice });
                return;
              }
              setFormData({
                ...formData,
                ...syncPartitionFromChoice(formData.total_capacity, choice),
              });
            }}
            disabled={disabled}
            className="w-full px-3 py-2 border border-gray-300 rounded-md disabled:bg-gray-50"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Lottery Capacity *</label>
          <input
            type="number"
            required
            min={0}
            value={formData.lottery_capacity}
            onChange={(e) => {
              const lottery = readNonNegInt(e.target.value, formData.lottery_capacity);
              if (!usesPartitionedCapacities(formData.total_capacity)) {
                setFormData({ ...formData, lottery_capacity: lottery });
                return;
              }
              setFormData({
                ...formData,
                ...syncPartitionFromLottery(formData.total_capacity, lottery),
              });
            }}
            disabled={disabled}
            className="w-full px-3 py-2 border border-gray-300 rounded-md disabled:bg-gray-50"
          />
        </div>
      </div>
    </>
  );
}

function CapacityQuotaInfoTip(props: {
  total_capacity: number;
  choice_capacity: number;
  lottery_capacity: number;
}) {
  const { total_capacity, choice_capacity, lottery_capacity } = props;
  return (
    <span className="relative inline-flex group">
      <button
        type="button"
        tabIndex={0}
        className="rounded-full p-0.5 text-gray-400 hover:text-gray-600 focus-visible:outline focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1"
        aria-label="Capacity and quota tips"
      >
        <Info className="w-5 h-5" />
      </button>
      <span
        role="tooltip"
        className="pointer-events-none invisible absolute left-1/2 top-full z-20 mt-2 w-[min(22rem,calc(100vw-3rem)))] -translate-x-1/2 rounded-lg bg-gray-900 px-3 py-2.5 text-left text-xs leading-relaxed text-white opacity-0 shadow-lg transition-opacity duration-150 group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100"
      >
        {usesPartitionedCapacities(total_capacity) && (
          <p className="mb-3 border-b border-gray-700 pb-3">
            Choice + Lottery always equals Total ({choice_capacity} + {lottery_capacity} ={' '}
            {total_capacity}). Editing one field updates the other.
          </p>
        )}
        <p className="text-gray-100">
          <span className="font-medium text-white">Capacity 1 (lecturers):</span> set both Choice and Lottery quotas to{' '}
          <strong>1</strong> so the supervisor can take one student in <em>either</em> the choice round or the lottery.
          Use Choice 1 + Lottery <strong>0</strong> (or 0 + 1) only if they must join a single phase only.
        </p>
      </span>
    </span>
  );
}

export default function SupervisorsPage() {
  const queryClient = useQueryClient();
  /** true → Professor … Lecturer; false → Lecturer … Professor */
  const [designationProfessorFirst, setDesignationProfessorFirst] = useState(true);
  const [filterDesignation, setFilterDesignation] = useState<string>('');
  const [filterQuery, setFilterQuery] = useState('');

  const [showAddForm, setShowAddForm] = useState(false);
  const [editSupervisor, setEditSupervisor] = useState<Supervisor | null>(null);
  const [addFormData, setAddFormData] = useState<SupervisorFormState>(() => emptySupervisorForm());
  const [editFormData, setEditFormData] = useState<SupervisorFormState>(() => emptySupervisorForm());

  const { data: supervisors, isLoading } = useQuery({
    queryKey: ['supervisors'],
    queryFn: () => supervisorsApi.list(),
  });

  const displayedSupervisors = useMemo(() => {
    let list = supervisors ?? [];
    const q = filterQuery.trim().toLowerCase();
    if (filterDesignation) {
      list = list.filter((s) => s.designation === filterDesignation);
    }
    if (q) {
      list = list.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          Boolean(s.email && s.email.toLowerCase().includes(q)),
      );
    }
    list = [...list].sort((a, b) => {
      const ra = designationRank(a.designation);
      const rb = designationRank(b.designation);
      const primary = designationProfessorFirst ? ra - rb : rb - ra;
      if (primary !== 0) return primary;
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
    });
    return list;
  }, [supervisors, filterDesignation, filterQuery, designationProfessorFirst]);

  const sumTotalCapacityShown = useMemo(
    () => displayedSupervisors.reduce((acc, s) => acc + s.total_capacity, 0),
    [displayedSupervisors],
  );

  const sumTotalCapacityAll = useMemo(
    () => (supervisors ?? []).reduce((acc, s) => acc + s.total_capacity, 0),
    [supervisors],
  );

  const filtersActive =
    Boolean(filterDesignation) || Boolean(filterQuery.trim());

  const createMutation = useMutation({
    mutationFn: supervisorsApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['supervisors'] });
      setAddFormData(emptySupervisorForm());
      setShowAddForm(false);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<Supervisor> }) =>
      supervisorsApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['supervisors'] });
      setEditSupervisor(null);
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

  const resetAddForm = () => {
    setAddFormData(emptySupervisorForm());
    setShowAddForm(false);
  };

  const handleSubmitAdd = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate({
      name: addFormData.name,
      designation: addFormData.designation,
      email: addFormData.email.trim() === '' ? null : addFormData.email,
      total_capacity: addFormData.total_capacity,
      choice_capacity: addFormData.choice_capacity,
      lottery_capacity: addFormData.lottery_capacity,
    });
  };

  const handleSubmitEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editSupervisor) return;
    updateMutation.mutate({
      id: editSupervisor.id,
      data: {
        name: editFormData.name,
        designation: editFormData.designation,
        email: editFormData.email.trim() === '' ? null : editFormData.email,
        total_capacity: editFormData.total_capacity,
        choice_capacity: editFormData.choice_capacity,
        lottery_capacity: editFormData.lottery_capacity,
      },
    });
  };

  const handleEdit = (sup: Supervisor) => {
    const part =
      usesPartitionedCapacities(sup.total_capacity)
        ? normalizePartitionForForm(sup.total_capacity, sup.choice_capacity, sup.lottery_capacity)
        : {
            choice_capacity: sup.choice_capacity,
            lottery_capacity: sup.lottery_capacity,
          };
    setEditFormData({
      name: sup.name,
      designation: sup.designation,
      email: sup.email || '',
      total_capacity: sup.total_capacity,
      choice_capacity: part.choice_capacity,
      lottery_capacity: part.lottery_capacity,
    });
    setEditSupervisor(sup);
  };

  const formBusy = createMutation.isPending || updateMutation.isPending;

  if (isLoading) return <div className="flex justify-center h-64 items-center text-gray-500">Loading...</div>;

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold">Supervisors</h2>
        <button
          type="button"
          onClick={() => setShowAddForm((v) => !v)}
          disabled={formBusy}
          className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Plus className="w-4 h-4" /> Add Supervisor
        </button>
      </div>

      {showAddForm && (
        <form
          onSubmit={handleSubmitAdd}
          className="bg-white border border-gray-200 rounded-lg p-6 mb-6"
        >
          <SupervisorFormFields
            title="Add Supervisor"
            formData={addFormData}
            setFormData={setAddFormData}
            disabled={createMutation.isPending}
          />
          <div className="flex gap-2 mt-4">
            <button
              type="submit"
              disabled={createMutation.isPending}
              className="inline-flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {createMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              Create
            </button>
            <button
              type="button"
              onClick={resetAddForm}
              disabled={createMutation.isPending}
              className="bg-gray-200 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-300 disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {editSupervisor && (
        <div
          className="fixed inset-0 z-[95] flex items-center justify-center p-4 bg-black/45"
          role="presentation"
          onClick={() => !updateMutation.isPending && setEditSupervisor(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-supervisor-title"
            className="bg-white rounded-xl shadow-xl max-w-3xl w-full p-6 border border-gray-200 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <form onSubmit={handleSubmitEdit}>
              <SupervisorFormFields
                title="Edit Supervisor"
                headingId="edit-supervisor-title"
                formData={editFormData}
                setFormData={setEditFormData}
                disabled={updateMutation.isPending}
              />
              <div className="flex justify-end gap-2 mt-4">
                <button
                  type="button"
                  onClick={() => setEditSupervisor(null)}
                  disabled={updateMutation.isPending}
                  className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={updateMutation.isPending}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {updateMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                  Update
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-gray-200 bg-gray-50">
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <span className="whitespace-nowrap">Search</span>
            <input
              type="search"
              placeholder="Name or email…"
              value={filterQuery}
              onChange={(e) => setFilterQuery(e.target.value)}
              className="min-w-[10rem] max-w-[20rem] flex-1 rounded-md border border-gray-300 px-3 py-1.5 text-sm"
            />
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <span className="whitespace-nowrap">Designation</span>
            <select
              value={filterDesignation}
              onChange={(e) => setFilterDesignation(e.target.value)}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm bg-white"
            >
              <option value="">All</option>
              {designations.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </label>
        </div>
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-700 w-14">#</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-700">Name</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-700">
                <button
                  type="button"
                  onClick={() => setDesignationProfessorFirst((v) => !v)}
                  className="inline-flex items-center gap-1 rounded-md hover:bg-gray-200/80 px-1 py-0.5 -ml-1 text-gray-700"
                  title={
                    designationProfessorFirst
                      ? 'Order: Professor → Lecturer. Click to reverse.'
                      : 'Order: Lecturer → Professor. Click to reverse.'
                  }
                  aria-label={
                    designationProfessorFirst
                      ? 'Sorting designation Professor through Lecturer, click to reverse sort order'
                      : 'Sorting designation Lecturer through Professor, click to reverse sort order'
                  }
                >
                  <span className="font-medium">Designation</span>
                  {designationProfessorFirst ? (
                    <ArrowUp className="w-4 h-4 text-blue-600 shrink-0" aria-hidden />
                  ) : (
                    <ArrowDown className="w-4 h-4 text-blue-600 shrink-0" aria-hidden />
                  )}
                </button>
              </th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-700">Total</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-700">Choice</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-700">Lottery</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-700">Available</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-700">Actions</th>
            </tr>
          </thead>
          <tbody>
            {displayedSupervisors.map((sup, rowIndex) => (
              <tr key={sup.id} className="border-t border-gray-100 hover:bg-gray-50">
                <td className="px-4 py-3 text-sm text-gray-500 tabular-nums font-mono">
                  {rowIndex + 1}
                </td>
                <td className="px-4 py-3">
                  <div className="font-medium">{sup.name}</div>
                  {sup.email && <div className="text-sm text-gray-500">{sup.email}</div>}
                </td>
                <td className="px-4 py-3 text-sm">{sup.designation}</td>
                <td className="px-4 py-3">
                  <div>{sup.total_capacity}</div>
                  {usesSharedSingleSeat(sup) && (
                    <div className="text-xs text-blue-700 mt-0.5">Either phase seat</div>
                  )}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={
                      !usesSharedSingleSeat(sup) && sup.choice_filled >= sup.choice_capacity
                        ? 'text-red-600 font-medium'
                        : usesSharedSingleSeat(sup) && combinedFilled(sup) >= sup.total_capacity
                          ? 'text-red-600 font-medium'
                          : 'text-green-600'
                    }
                  >
                    {sup.choice_filled}/{sup.choice_capacity}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span
                    className={
                      !usesSharedSingleSeat(sup) && sup.lottery_filled >= sup.lottery_capacity
                        ? 'text-red-600 font-medium'
                        : usesSharedSingleSeat(sup) && combinedFilled(sup) >= sup.total_capacity
                          ? 'text-red-600 font-medium'
                          : 'text-green-600'
                    }
                  >
                    {sup.lottery_filled}/{sup.lottery_capacity}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <button
                    type="button"
                    onClick={() => toggleMutation.mutate(sup.id)}
                    disabled={formBusy || toggleMutation.isPending}
                    className={`p-1 rounded disabled:opacity-40 ${sup.is_available ? 'text-green-600' : 'text-gray-400'}`}
                  >
                    {sup.is_available ? <ToggleRight className="w-6 h-6" /> : <ToggleLeft className="w-6 h-6" />}
                  </button>
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => handleEdit(sup)}
                      disabled={formBusy}
                      className="p-1 text-blue-600 hover:bg-blue-50 rounded disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (confirm(`Delete ${sup.name}?`)) {
                          deleteMutation.mutate(sup.id);
                        }
                      }}
                      disabled={formBusy || deleteMutation.isPending}
                      className="p-1 text-red-600 hover:bg-red-50 rounded disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {(!supervisors || supervisors.length === 0) && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-gray-500">
                  No supervisors added yet. Click &quot;Add Supervisor&quot; to begin.
                </td>
              </tr>
            )}
            {supervisors && supervisors.length > 0 && displayedSupervisors.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-gray-500">
                  No rows match your filters.
                </td>
              </tr>
            )}
          </tbody>
          {supervisors && supervisors.length > 0 && displayedSupervisors.length > 0 && (
            <tfoot>
              <tr className="bg-slate-100 border-t-2 border-slate-300 text-gray-900">
                <td colSpan={3} className="px-4 py-3 text-right text-sm font-semibold">
                  Total capacity sum
                  {filtersActive && (
                    <span className="block text-xs font-normal text-gray-600 mt-0.5">
                      Shown rows · dept total {sumTotalCapacityAll}
                    </span>
                  )}
                  {!filtersActive && (
                    <span className="block text-xs font-normal text-gray-600 mt-0.5">
                      May exceed current cohort headcount if staff host earlier-batch thesis students too.
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-sm font-bold tabular-nums">{sumTotalCapacityShown}</td>
                <td colSpan={4} className="px-4 py-3" />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
