import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { REPORT_TITLE_DEFAULTS, resolveReportTitle, type ReportKey, type ReportTitleConfig } from '@stap/shared';
import { settingsApi } from '../lib/settings.api';

const TITLES_KEY = ['report-titles'];
export function useReportTitles() {
  return useQuery({ queryKey: TITLES_KEY, queryFn: settingsApi.getReportTitles,
    initialData: REPORT_TITLE_DEFAULTS, staleTime: 0, refetchOnWindowFocus: true });
}
export function useReportTitle(key: ReportKey): ReportTitleConfig {
  const { data } = useReportTitles();
  return resolveReportTitle(key, data);
}
export function useSaveReportTitle() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: ({ key, config }: { key: ReportKey; config: Partial<ReportTitleConfig> }) => settingsApi.updateReportTitle(key, config),
    onMutate: async ({ key, config }) => {
      await qc.cancelQueries({ queryKey: TITLES_KEY });
      const previous = qc.getQueryData(TITLES_KEY);
      qc.setQueryData(TITLES_KEY, (old: any) => ({ ...REPORT_TITLE_DEFAULTS, ...old, [key]: resolveReportTitle(key, { ...old, [key]: { ...old?.[key], ...config } }) }));
      return { previous };
    }, onError: (_err, _vars, context) => { if (context?.previous) qc.setQueryData(TITLES_KEY, context.previous); },
    onSuccess: data => qc.setQueryData(TITLES_KEY, data),
  });
}
export function useResetReportTitle() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (key?: ReportKey) => settingsApi.resetReportTitle(key),
    onMutate: async key => {
      await qc.cancelQueries({ queryKey: TITLES_KEY });
      const previous = qc.getQueryData(TITLES_KEY);
      qc.setQueryData(TITLES_KEY, (old: any) => key
        ? { ...old, [key]: REPORT_TITLE_DEFAULTS[key] }
        : REPORT_TITLE_DEFAULTS);
      return { previous };
    },
    onError: (_err, _key, context) => { if (context?.previous) qc.setQueryData(TITLES_KEY, context.previous); },
    onSuccess: data => qc.setQueryData(TITLES_KEY, data),
  });
}
export function useReportEmailPrefix() {
  return useQuery({ queryKey: ['report-email-prefix'], queryFn: settingsApi.getReportEmailPrefix,
    initialData: 'STAP Report', staleTime: 0, refetchOnWindowFocus: true });
}
export function useSaveReportEmailPrefix() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: settingsApi.updateReportEmailPrefix, onMutate: async prefix => {
    await qc.cancelQueries({ queryKey: ['report-email-prefix'] }); const previous = qc.getQueryData(['report-email-prefix']);
    qc.setQueryData(['report-email-prefix'], prefix); return { previous };
  }, onError: (_e, _p, ctx) => qc.setQueryData(['report-email-prefix'], ctx?.previous),
  onSuccess: data => qc.setQueryData(['report-email-prefix'], data) });
}
