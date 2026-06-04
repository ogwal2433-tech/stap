import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { lettersApi } from '../lib/letters.api';
import { useToast } from '../context/ToastContext';
import type { GenerateLetterInput, ApproveLetterInput } from '@stap/shared';

export function useLetters(params?: Parameters<typeof lettersApi.list>[0]) {
  return useQuery({
    queryKey: ['letters', params],
    queryFn:  () => lettersApi.list(params),
    staleTime: 30 * 1000,
  });
}

export function useLettersBySubject(subjectId: string) {
  return useQuery({
    queryKey: ['letters', 'subject', subjectId],
    queryFn:  () => lettersApi.list({ subjectId, limit: 50 }),
    enabled:  !!subjectId,
    staleTime: 30 * 1000,
  });
}

export function useGenerateLetterRecord() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: GenerateLetterInput) => lettersApi.generate(data),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ['letters'] });
      qc.invalidateQueries({ queryKey: ['letters', 'subject', result.subjectId] });
    },
  });
}

export function useApproveLetter() {
  const qc = useQueryClient();
  const { showToast } = useToast();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: ApproveLetterInput }) =>
      lettersApi.approve(id, data),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ['letters'] });
      qc.invalidateQueries({ queryKey: ['letters', 'subject', result.subjectId] });
      showToast(
        result.approvalStatus === 'APPROVED' ? 'Letter approved' : 'Letter rejected',
        result.approvalStatus === 'APPROVED' ? 'success' : 'warning',
      );
    },
  });
}
