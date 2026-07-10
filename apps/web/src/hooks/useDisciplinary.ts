import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { disciplinaryApi } from '../lib/disciplinary.api';
import type { CreateDisciplinaryInput } from '@stap/shared';

export function useDisciplinaryRecords(guardId: string) {
  return useQuery({
    queryKey: ['disciplinary', guardId],
    queryFn: () => disciplinaryApi.list(guardId),
    enabled: Boolean(guardId),
  });
}

export function useCreateDisciplinaryRecord() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ guardId, data }: { guardId: string; data: Omit<CreateDisciplinaryInput, 'guardId'> }) =>
      disciplinaryApi.create(guardId, data),
    onSuccess: (_result, variables) => {
      queryClient.invalidateQueries({ queryKey: ['disciplinary', variables.guardId] });
      queryClient.invalidateQueries({ queryKey: ['guard', variables.guardId] });
    },
  });
}

export function useGuardLetters(guardId: string) {
  return useQuery({
    queryKey: ['guard-letters', guardId],
    queryFn: () => disciplinaryApi.listLetters(guardId),
    enabled: Boolean(guardId),
  });
}
