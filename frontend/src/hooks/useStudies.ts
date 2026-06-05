import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  computeSignificance,
  getLockboxStatus,
  getStudy,
  getStudyStatus,
  listStudies,
  rerunStudy,
  runLockbox,
  startStudy,
} from '@/api/validation'
import { adaptivePollingInterval } from '@/lib/polling'
import type {
  StartStudyRequest,
  StartStudyResponse,
  StudyRerunResponse,
  UUID,
  ValidationStudy,
  ValidationStudyStatus,
} from '@/api/types'

export function studiesQueryKey(): readonly unknown[] {
  return ['validation', 'studies'] as const
}

export function studyQueryKey(studyId: UUID): readonly unknown[] {
  return ['validation', 'study', studyId] as const
}

export function studyStatusQueryKey(studyId: UUID): readonly unknown[] {
  return ['validation', 'study', 'status', studyId] as const
}

export function useStudies() {
  return useQuery({
    queryKey: studiesQueryKey(),
    queryFn: () => listStudies(),
    // Validation-page redesign: poll gently while any study is in flight so
    // the table's progress bars and status pills stay live; stop when all
    // studies are terminal.
    refetchInterval: (query) => {
      const studies = query.state.data?.studies ?? []
      const active = studies.some((s: ValidationStudy) => s.status === 'queued' || s.status === 'running')
      return active ? 3000 : false
    },
    refetchOnWindowFocus: false,
  })
}

export function useStudy(studyId: UUID | undefined) {
  return useQuery<ValidationStudy>({
    queryKey: studyQueryKey(studyId ?? ''),
    queryFn: () => getStudy(studyId as UUID),
    enabled: !!studyId,
  })
}

export function useStudyStatus(studyId: UUID | undefined) {
  return useQuery<ValidationStudyStatus>({
    queryKey: studyStatusQueryKey(studyId ?? ''),
    queryFn: () => getStudyStatus(studyId as UUID),
    enabled: !!studyId,
    refetchInterval: query => adaptivePollingInterval(query),
    refetchOnWindowFocus: false,
  })
}

export function useStartStudy() {
  const client = useQueryClient()
  return useMutation<StartStudyResponse, Error, StartStudyRequest>({
    mutationFn: startStudy,
    onSuccess: () => {
      client.invalidateQueries({ queryKey: studiesQueryKey() })
    },
  })
}

// Feature 014 (FR-010): clone an existing study into a fresh, drillable one.
export function useRerunStudy() {
  const client = useQueryClient()
  return useMutation<StudyRerunResponse, Error, UUID>({
    mutationFn: rerunStudy,
    onSuccess: () => {
      client.invalidateQueries({ queryKey: studiesQueryKey() })
    },
  })
}

export function lockboxQueryKey(): readonly unknown[] {
  return ['validation', 'lockbox'] as const
}

export function useLockboxStatus() {
  return useQuery({ queryKey: lockboxQueryKey(), queryFn: () => getLockboxStatus() })
}

export function useRunLockbox() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (body: { config_name: string; override?: boolean }) => runLockbox(body),
    onSuccess: () => client.invalidateQueries({ queryKey: lockboxQueryKey() }),
  })
}

export function useSignificance() {
  return useMutation({
    mutationFn: (runId: UUID) => computeSignificance({ run_id: runId }),
  })
}
