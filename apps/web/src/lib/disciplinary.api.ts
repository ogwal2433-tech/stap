import api from './api';
import type {
  DisciplinaryResponse,
  GuardDocumentResponse,
  CreateDisciplinaryInput,
} from '@security360/shared';

export const disciplinaryApi = {
  create(guardId: string, data: Omit<CreateDisciplinaryInput, 'guardId'>): Promise<DisciplinaryResponse> {
    return api
      .post<{ success: boolean; data: DisciplinaryResponse }>(
        `/guards/${guardId}/disciplinary`,
        { ...data, guardId },
      )
      .then((r) => r.data.data);
  },

  list(guardId: string): Promise<DisciplinaryResponse[]> {
    return api
      .get<{ success: boolean; data: DisciplinaryResponse[] }>(`/guards/${guardId}/disciplinary`)
      .then((r) => r.data.data);
  },

  listLetters(guardId: string): Promise<GuardDocumentResponse[]> {
    return api
      .get<{ success: boolean; data: GuardDocumentResponse[] }>(`/guards/${guardId}/letters`)
      .then((r) => r.data.data);
  },
};
