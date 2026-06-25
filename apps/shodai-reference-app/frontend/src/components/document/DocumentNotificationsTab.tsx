import NotificationRulesView from "@/components/NotificationRulesView";
import type { NotificationTemplate } from "@/hooks/useNotificationsApi";

export interface DocumentNotificationsTabProps {
  template: NotificationTemplate | null;
  loading: boolean;
  error: string | null;
}

export function DocumentNotificationsTab({ template, loading, error }: DocumentNotificationsTabProps) {
  return (
    <div className="flex w-full flex-1 flex-col items-center overflow-y-auto">
      <NotificationRulesView template={template} loading={loading} error={error} />
    </div>
  );
}
