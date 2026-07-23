type BudgetGuidanceInput = {
  budgetTotal: number | null | undefined;
  currency: string;
  dayCount: number;
  travelers: number;
};

export function buildBudgetGuidance({
  budgetTotal,
  currency,
  dayCount,
  travelers,
}: BudgetGuidanceInput) {
  if (!budgetTotal || budgetTotal <= 0) {
    return "用户未设置明确预算：采用舒适但不过度消费的中档方案，给出各项目合理费用估算，并在最终方案中说明预计总花费。";
  }
  const safeDays = Math.max(1, dayCount);
  const safeTravelers = Math.max(1, travelers);
  const perPersonBudget = budgetTotal / safeTravelers;
  const perPersonDaily = perPersonBudget / safeDays;
  const formatted = new Intl.NumberFormat("zh-CN", {
    maximumFractionDigits: 0,
  });
  let tier = "舒适型";
  let choices =
    "住宿优先位置便利、品质稳定的中高档选择；餐饮安排当地特色正餐；交通在公共交通与打车之间平衡；可加入少量付费体验。";
  if (currency === "CNY" && perPersonDaily < 500) {
    tier = "经济型";
    choices =
      "优先高性价比住宿、公共交通、免费或低票价景点和当地平价餐饮，减少不必要的跨区移动与高价体验。";
  } else if (currency === "CNY" && perPersonDaily >= 1500) {
    tier = "高品质型";
    choices =
      "住宿应明显升级到位置优越的高档或特色酒店，餐饮至少安排代表性精品餐厅，跨区移动优先舒适省时方式，并加入高质量文化体验、演出、私享导览或其他与目的地匹配的付费项目；不要仍然输出与经济预算相同的方案。";
  }
  return `预算是硬约束也是方案偏好：总预算 ${formatted.format(budgetTotal)} ${currency}，${safeTravelers} 人，${safeDays} 天；折合人均总预算约 ${formatted.format(perPersonBudget)} ${currency}、人均每天约 ${formatted.format(perPersonDaily)} ${currency}，按“${tier}”规划。${choices} 先预留总预算约 10% 作为机动金，再在住宿、餐饮、交通、门票与体验之间分配；每个收费项目给出合理估算、每天给出小计、最后给出全程预计总额，并将预计总额控制在总预算的 80%–100%。预算较高时应提升品质、便利性与独特体验，但不得为了花完预算而浪费。`;
}
