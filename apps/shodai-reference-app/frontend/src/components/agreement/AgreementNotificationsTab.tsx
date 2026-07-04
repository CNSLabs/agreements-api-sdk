import NotificationRulesView from "@/components/NotificationRulesView";
import type { NotificationTemplate } from "@/hooks/useNotificationsApi";

export interface AgreementNotificationsTabProps {
  template: NotificationTemplate | null;
  loading: boolean;
  error: string | null;
}

export function AgreementNotificationsTab({ template, loading, error }: AgreementNotificationsTabProps) {
  return (
    <div className="flex max-w-[1280px] grow shrink-0 basis-0 flex-col items-center gap-4 self-stretch">
      <NotificationRulesView template={template} loading={loading} error={error} />
    </div>
  );
}
