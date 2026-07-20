export type DispatchDecision = {
  pendingPlanDecision: "accept" | "revise" | "reject" | "undecided";
  requestKind: "answer" | "plan" | "none";
};

const compact = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[\s，。！？、,.!?；;：:~～]+/g, "");

/**
 * Handles only high-confidence conversational controls. Ambiguous messages are
 * deliberately left to the semantic model instead of being guessed here.
 */
export function deterministicDispatch(
  message: string,
  hasPendingPlan: boolean,
): DispatchDecision | null {
  const text = compact(message);
  if (!text) return null;

  if (hasPendingPlan) {
    const rejectsPlan =
      /(不要|取消|放弃|作废)(这个|该|当前|现有)?(方案|行程|安排)/.test(text) ||
      /(这个|该|当前|现有)(方案|行程|安排)(不要|取消|放弃|作废)/.test(text);
    if (rejectsPlan)
      return { pendingPlanDecision: "reject", requestKind: "none" };

    const acceptsPlan =
      /^(就这样|这样就行|这样可以|可以了|没问题|挺好|满意|确认|确定|同意|采用|按这个|按此|照这个|照此|就按这个|就按此|不用改|无需改|不改了|不用调整|无需调整|不调整了|没有修改|没什么修改|不需要修改|不用了就这样|不了就这样)(吧|了|即可|就好|就行|可以)?$/.test(
        text,
      ) ||
      /(不用|不需要|无需|不了).{0,4}(改|调整|修改|建议|查询|补充).{0,4}(就这样|按这个|可以|行)/.test(
        text,
      ) ||
      /(没有|没什么|不需要|无需).{0,4}(改|调整|修改).{0,4}(就按|按此|按这个|就这样)/.test(
        text,
      );
    if (acceptsPlan)
      return { pendingPlanDecision: "accept", requestKind: "none" };

    const asksForRevision =
      /(改|调整|修改|换|删|增加|加上|重新)(一下|下|个)?(方案|行程|安排|景点|酒店|住宿|时间|路线)?/.test(
        text,
      ) || /(不太行|不合适|有问题|再规划|重新规划)/.test(text);
    if (asksForRevision)
      return { pendingPlanDecision: "revise", requestKind: "plan" };
  }

  return null;
}

export function dispatchAction(
  decision: DispatchDecision,
  hasPendingPlan: boolean,
) {
  const intent =
    decision.pendingPlanDecision === "accept" && hasPendingPlan
      ? "accept_pending_plan"
      : decision.pendingPlanDecision === "revise" ||
          decision.requestKind === "plan"
        ? "create_or_revise_plan"
        : "answer";
  return {
    action:
      intent === "accept_pending_plan"
        ? ("apply" as const)
        : intent === "create_or_revise_plan"
          ? ("plan" as const)
          : ("reply" as const),
    intent,
  };
}

export function looksLikePlanCandidate(message: string) {
  if (message.length < 600) return false;
  const hasPlanHeading = /(行程方案|完整行程|逐日行程|旅行方案)/.test(message);
  const hasDays = /(Day\s*1|第[一1]天).*(Day\s*2|第[二2]天)/is.test(message);
  const asksForConfirmation =
    /(你觉得这个方案|确认后|如果你满意|方案怎么样|正式写入行程)/.test(message);
  return hasPlanHeading && (hasDays || asksForConfirmation);
}
