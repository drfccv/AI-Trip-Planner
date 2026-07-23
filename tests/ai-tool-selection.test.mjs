import assert from "node:assert/strict";
import test from "node:test";
import {
  selectFormatResearchTools,
  selectRelevantTools,
} from "../lib/ai/tool-selection.ts";

const catalog = [
  {
    alias: "mcp_map",
    providerName: "高德地图",
    toolName: "maps_direction_walking",
    description: "步行路线",
  },
  {
    alias: "mcp_hotel",
    providerName: "RollingGo",
    toolName: "searchHotels",
    description: "Search hotels",
  },
  {
    alias: "mcp_flight",
    providerName: "RollingGo",
    toolName: "searchFlights",
    description: "Search flights",
  },
  {
    alias: "mcp_web",
    providerName: "SearXNG",
    toolName: "searxng_web_search",
    description: "聚合网页搜索",
  },
];

test("always keeps core map tools and only loads requested travel categories", () => {
  assert.deepEqual(
    selectRelevantTools(catalog, "规划苏州市内景点路线").map((x) => x.alias),
    ["mcp_map", "mcp_web"],
  );
  assert.deepEqual(
    selectRelevantTools(catalog, "规划苏州行程并安排酒店").map((x) => x.alias),
    ["mcp_map", "mcp_hotel", "mcp_web"],
  );
  assert.deepEqual(
    selectRelevantTools(catalog, "规划行程并查询航班").map((x) => x.alias),
    ["mcp_map", "mcp_flight", "mcp_web"],
  );
});

test("does not expose web research for an unrelated short reply", () => {
  assert.deepEqual(
    selectRelevantTools(catalog, "你好").map((x) => x.alias),
    ["mcp_map"],
  );
});

test("format research only exposes place detail, image, and web tools", () => {
  const formatCatalog = [
    ...catalog,
    {
      alias: "mcp_detail",
      providerName: "高德地图",
      toolName: "maps_search_detail",
      description: "地点搜索",
    },
    {
      alias: "mcp_weather",
      providerName: "高德地图",
      toolName: "maps_weather",
      description: "天气查询",
    },
  ];
  assert.deepEqual(
    selectFormatResearchTools(formatCatalog).map((x) => x.alias),
    ["mcp_web", "mcp_detail"],
  );
});
