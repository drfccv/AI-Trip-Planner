type ToolCatalogItem = {
  alias: string;
  providerName: string;
  toolName: string;
  description?: string;
};

const categoryRules: Array<{ task: RegExp; tool: RegExp }> = [
  {
    task: /酒店|住宿|民宿|入住|退房|hotel|lodg/i,
    tool: /酒店|hotel|lodg/i,
  },
  {
    task: /航班|飞机|机场|机票|flight|airport/i,
    tool: /航班|飞机|机场|flight|airport/i,
  },
  {
    task: /火车|高铁|动车|车票|铁路|train|rail|ticket/i,
    tool: /火车|高铁|动车|车票|铁路|train|rail|ticket/i,
  },
  {
    task: /景点|行程|旅行|旅游|规划|攻略|介绍|历史|人文|attraction|itinerary|travel|guide/i,
    tool: /网页|网络|正文|web|extract|searx|tavily/i,
  },
];

const coreTravelTool =
  /地图|地点|地址|位置|路线|步行|公交|驾车|骑行|距离|天气|map|place|poi|direction|route|walking|transit|driving|weather/i;

export function selectRelevantTools<T extends ToolCatalogItem>(
  catalog: T[],
  task: string,
) {
  const selected = catalog.filter((item) => {
    const searchable =
      `${item.providerName} ${item.toolName} ${item.description || ""}`;
    if (coreTravelTool.test(searchable)) return true;
    return categoryRules.some(
      (rule) => rule.task.test(task) && rule.tool.test(searchable),
    );
  });
  return selected.length ? selected : catalog;
}

const formatResearchTool =
  /maps_search_detail|maps_text_search|place.*detail|poi.*detail|searx|tavily|web_url_read|网页|正文|图片|照片|image|photo|extract/i;

export function selectFormatResearchTools<T extends ToolCatalogItem>(
  catalog: T[],
) {
  return catalog.filter((item) =>
    formatResearchTool.test(
      `${item.providerName} ${item.toolName} ${item.description || ""}`,
    ),
  );
}
