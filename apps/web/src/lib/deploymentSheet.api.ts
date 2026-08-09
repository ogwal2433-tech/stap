import api from './api';
import type { DeploymentSheetRow, DeploymentSheetResult } from '@stap/shared';

export const deploymentSheetApi = {
  save(rows: DeploymentSheetRow[]): Promise<DeploymentSheetResult> {
    return api
      .post<{ success: boolean; data: DeploymentSheetResult }>('/attendance/deployment-sheet', { rows })
      .then((r) => r.data.data);
  },
};
