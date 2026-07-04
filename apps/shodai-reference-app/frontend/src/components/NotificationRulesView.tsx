import React from "react";
import { Accordion } from "@/subframe/components/Accordion";
import { Avatar } from "@/subframe/components/Avatar";
import { DisplayCard } from "@/subframe/components/DisplayCard";
import { Badge } from "@/subframe/components/Badge";
import {
  FeatherBell,
  FeatherCheckCircle,
  FeatherCircleDot,
  FeatherClock,
  FeatherFileInput,
  FeatherPlayCircle,
  FeatherXCircle,
} from "@subframe/core";
import type {
  NotificationTemplate,
  NotificationRule,
  TransitionTrigger,
  TemporalTrigger,
} from "@/hooks/useNotificationsApi";

interface NotificationRulesViewProps {
  template: NotificationTemplate | null;
  loading?: boolean;
  error?: string | null;
}

const NotificationRulesView: React.FC<NotificationRulesViewProps> = ({ template, loading, error }) => {
  if (loading) {
    return (
      <div className="flex w-full flex-col items-center justify-center gap-4 px-6 py-12">
        <span className="text-body font-body text-subtext-color">Loading notification rules...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex w-full flex-col items-center justify-center gap-4 px-6 py-12">
        <span className="text-body font-body text-error-600">{error}</span>
      </div>
    );
  }

  if (!template) {
    return (
      <div className="flex w-full flex-col items-center justify-center gap-4 px-6 py-12">
        <span className="text-body font-body text-subtext-color">
          No notification template found for this agreement template.
        </span>
      </div>
    );
  }

  const formatRecipients = (recipients: string[]): string[] =>
    recipients.map((recipient) => {
      if (recipient === "*") return "All participants";
      if (recipient === "@observers") return "Observers";
      return recipient;
    });

  const getRuleIcon = (rule: NotificationRule) => {
    const name = rule.name.toLowerCase();
    if (name.includes("initialized") || name.includes("deployed")) return <FeatherPlayCircle />;
    if (name.includes("due") || name.includes("deadline") || name.includes("reminder")) return <FeatherClock />;
    if (name.includes("submitted") || name.includes("invoice")) return <FeatherFileInput />;
    if (name.includes("rejected") || name.includes("terminated") || name.includes("disputed")) return <FeatherXCircle />;
    if (name.includes("approved") || name.includes("accepted") || name.includes("settled")) return <FeatherCheckCircle />;
    return <FeatherBell />;
  };

  const renderRuleCondition = (rule: NotificationRule) => {
    const trigger = rule.trigger;

    if (trigger.type === "onTransition") {
      const transitionTrigger = trigger as TransitionTrigger;
      if (transitionTrigger.inputs?.length) {
        return (
          <div className="flex flex-wrap items-start gap-2">
            {transitionTrigger.inputs.map((input, idx) => (
              <React.Fragment key={input}>
                {idx > 0 && <span className="text-caption font-caption text-default-font">OR</span>}
                <Badge className="h-4 w-auto flex-none" icon={<FeatherFileInput />}>
                  {input === "__deploy" ? "Deployment" : input}
                </Badge>
              </React.Fragment>
            ))}
          </div>
        );
      }
      if (transitionTrigger.to?.length) {
        return (
          <div className="flex flex-wrap items-start gap-2">
            {transitionTrigger.to.map((state, idx) => (
              <React.Fragment key={state}>
                {idx > 0 && <span className="text-caption font-caption text-default-font">OR</span>}
                <Badge className="h-4 w-auto flex-none" icon={<FeatherCircleDot />}>
                  {state}
                </Badge>
              </React.Fragment>
            ))}
          </div>
        );
      }
      return <span className="text-caption font-caption text-default-font">Any matching transition</span>;
    }

    const temporalTrigger = trigger as TemporalTrigger;
    const condition = temporalTrigger.condition;
    return (
      <div className="flex flex-col items-start gap-2">
        {temporalTrigger.states.map((state) => (
          <div key={state} className="flex flex-wrap items-start gap-2">
            <span className="text-caption font-caption text-default-font">In state</span>
            <Badge className="h-4 w-auto flex-none" icon={<FeatherCircleDot />}>
              {state}
            </Badge>
            <span className="text-caption font-caption text-default-font">when</span>
            <Badge className="h-4 w-auto flex-none">{condition.type}</Badge>
            {condition.variable ? <Badge className="h-4 w-auto flex-none">{condition.variable}</Badge> : null}
            <span className="text-caption font-caption text-default-font">
              {condition.threshold.value} {condition.threshold.unit}
            </span>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="flex w-full max-w-[1024px] flex-col items-center gap-6 px-6 py-8 mobile:px-4 mobile:py-4">
      <div className="flex w-full items-center gap-4">
        <div className="flex flex-col items-start gap-1">
          <span className="text-heading-2 font-heading-2 text-default-font">Notification Summary</span>
          <div className="flex items-center gap-2">
            <Avatar square={true}>{template.rules.length}</Avatar>
            <span className="text-body-bold font-body-bold text-subtext-color">
              notifications configured for this agreement
            </span>
          </div>
        </div>
      </div>

      <div className="flex w-full flex-col items-center gap-3">
        {template.rules.length === 0 ? (
          <DisplayCard
            icon={<FeatherBell />}
            title="No notification rules defined"
            description="This template does not define participant or observer notifications."
            divider
            content={<div className="flex w-full items-center justify-center px-6 py-8" />}
          />
        ) : (
          template.rules.map((rule, idx) => {
            const recipients = formatRecipients(rule.recipients);
            const isTemporal = rule.trigger.type === "temporal";
            const isImmediate = rule.trigger.type === "onTransition";

            return (
              <div
                key={rule.id}
                className="flex w-full flex-col items-start gap-3 rounded-md border border-solid border-neutral-border bg-default-background shadow-sm"
              >
                <Accordion
                  trigger={
                    <div className="flex w-full items-center gap-3 px-4 py-4">
                      <Avatar variant="neutral">{idx + 1}</Avatar>
                      <div className="flex grow shrink-0 basis-0 flex-col items-start gap-1">
                        <div className="flex items-center gap-2">
                          {getRuleIcon(rule)}
                          <span className="text-heading-3 font-heading-3 text-default-font">{rule.name}</span>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-caption font-caption text-subtext-color">Notified:</span>
                          {recipients.map((recipient) => (
                            <Badge key={recipient} className="h-5 w-auto flex-none" variant="neutral">
                              {recipient}
                            </Badge>
                          ))}
                        </div>
                      </div>
                      <Accordion.Chevron />
                    </div>
                  }
                >
                  <div className="flex w-full flex-col items-start gap-2 border-t border-solid border-neutral-border bg-default-background px-4 py-4">
                    <DetailRow label="Timing:" value={isImmediate ? "Immediate" : "Scheduled"} />
                    <div className="flex items-start gap-2">
                      <span className="w-20 flex-none text-caption-bold font-caption-bold text-subtext-color">
                        {isTemporal ? "Rule(s):" : "Condition:"}
                      </span>
                      {renderRuleCondition(rule)}
                    </div>
                    {rule.notification.title ? <DetailRow label="Title:" value={rule.notification.title} /> : null}
                    <DetailRow label="Subject:" value={rule.notification.subject} />
                    <DetailRow label="Message:" value={rule.notification.body || "<message>"} />
                    {rule.notification.ctaLabel ? <DetailRow label="CTA:" value={rule.notification.ctaLabel} /> : null}
                  </div>
                </Accordion>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start gap-2">
      <span className="w-20 flex-none text-caption-bold font-caption-bold text-subtext-color">{label}</span>
      <span className="text-caption font-caption text-default-font">{value}</span>
    </div>
  );
}

export default NotificationRulesView;
