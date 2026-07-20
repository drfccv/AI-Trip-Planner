import type { McpProviderId, McpServerConfig, McpTool } from "./types";

export const providerDefaults = (): Record<McpProviderId, McpServerConfig> => ({
  rail12306: {
    id: "rail12306",
    name: "12306",
    endpoint: process.env.MCP_12306_URL || "",
    homepage: "https://github.com/drfccv/mcp-server-12306",
    apiKey: process.env.MCP_12306_API_KEY || "",
    authMode: process.env.MCP_12306_API_KEY ? "bearer" : "none",
    enabled: false,
    permission: "readonly",
    source: "builtin",
  },
  searxng: {
    id: "searxng",
    name: "SearXNG 搜索",
    endpoint: process.env.MCP_SEARXNG_URL || "",
    homepage: "https://github.com/ihor-sokoliuk/mcp-searxng",
    authMode: "none",
    enabled: false,
    permission: "readonly",
    source: "builtin",
  },
  amap: {
    id: "amap",
    name: "高德地图",
    endpoint: process.env.MCP_AMAP_URL || "https://mcp.amap.com/mcp",
    apiKey: process.env.AMAP_WEB_SERVICE_KEY || "",
    authMode: process.env.AMAP_WEB_SERVICE_KEY ? "bearer" : "none",
    enabled: true,
    permission: "readonly",
    source: "builtin",
  },
  tavily: {
    id: "tavily",
    name: "Tavily 搜索",
    endpoint: process.env.MCP_TAVILY_URL || "https://mcp.tavily.com/mcp/",
    apiKey: process.env.TAVILY_API_KEY || "",
    authMode: process.env.TAVILY_API_KEY ? "bearer" : "none",
    enabled: true,
    permission: "readonly",
    source: "builtin",
  },
  dida: {
    id: "dida",
    name: "RollingGo 道旅酒店",
    endpoint: process.env.MCP_DIDA_URL || "https://mcp.rollinggo.cn/mcp",
    apiKey: process.env.DIDA_API_KEY || process.env.ROLLINGGO_API_KEY || "",
    authMode:
      process.env.DIDA_API_KEY || process.env.ROLLINGGO_API_KEY
        ? "bearer"
        : "none",
    enabled: true,
    permission: "readonly",
    source: "builtin",
  },
  didaFlight: {
    id: "didaFlight",
    name: "RollingGo 道旅机票",
    endpoint:
      process.env.MCP_DIDA_FLIGHT_URL || "https://mcp.rollinggo.cn/mcp/flight",
    apiKey: process.env.DIDA_API_KEY || process.env.ROLLINGGO_API_KEY || "",
    authMode:
      process.env.DIDA_API_KEY || process.env.ROLLINGGO_API_KEY
        ? "bearer"
        : "none",
    enabled: true,
    permission: "readonly",
    source: "builtin",
  },
});

export const knownToolSchemas: Record<McpProviderId, McpTool[]> = {
  rail12306: [
    { name: "search_stations", description: "搜索车站" },
    { name: "search_tickets", description: "查询车次、余票与票价" },
    { name: "search_transfer", description: "查询中转换乘" },
    { name: "get_train_route", description: "查询列车经停站" },
  ],
  searxng: [
    { name: "searxng_web_search", description: "聚合网页搜索" },
    { name: "searxng_search_suggestions", description: "搜索建议" },
    { name: "web_url_read", description: "读取网页正文" },
  ],
  amap: [
    { name: "maps_geo", description: "地理编码" },
    { name: "maps_search_detail", description: "地点搜索" },
    { name: "maps_direction_transit_integrated", description: "公交路线规划" },
    { name: "maps_weather", description: "天气查询" },
  ],
  tavily: [
    { name: "tavily-search", description: "实时网页搜索" },
    { name: "tavily-extract", description: "提取网页正文" },
  ],
  dida: [
    {
      name: "searchHotels",
      description:
        "按地点、日期、星级、人数和标签搜索酒店；返回价格为展示参考价",
      inputSchema: {
        type: "object",
        required: ["originQuery", "place", "placeType"],
        properties: {
          originQuery: { type: "string" },
          place: { type: "string" },
          placeType: {
            enum: [
              "城市",
              "机场",
              "景点",
              "火车站",
              "地铁站",
              "酒店",
              "区/县",
              "详细地址",
            ],
          },
          countryCode: { type: "string" },
          size: { type: "number", minimum: 1, maximum: 20 },
          checkInParam: { type: "object" },
          filterOptions: { type: "object" },
          hotelTags: { type: "object" },
        },
      },
    },
    {
      name: "getHotelDetail",
      description:
        "查询指定酒店的实时房型、价格计划和取消政策；hotelId 与 name 至少提供一个",
      inputSchema: {
        type: "object",
        properties: {
          hotelId: { type: "number" },
          name: { type: "string" },
          dateParam: { type: "object" },
          occupancyParam: { type: "object" },
          localeParam: { type: "object" },
        },
      },
    },
    {
      name: "getHotelSearchTags",
      description: "获取酒店搜索支持的标签与分类",
      inputSchema: { type: "object", properties: {} },
    },
  ],
  didaFlight: [
    {
      name: "searchAirports",
      description: "按城市名、机场名或 IATA 代码搜索机场",
      inputSchema: {
        type: "object",
        required: ["keyword"],
        properties: { keyword: { type: "string" } },
      },
    },
    {
      name: "searchFlights",
      description: "查询航班列表、实时价格和库存",
      inputSchema: {
        type: "object",
        required: [
          "adultNumber",
          "childNumber",
          "cabinGrade",
          "tripType",
          "fromDate",
        ],
        properties: {
          adultNumber: { type: "integer", minimum: 1 },
          childNumber: { type: "integer", minimum: 0 },
          cabinGrade: {
            enum: ["ECONOMY", "PREMIUM_ECONOMY", "BUSINESS", "FIRST"],
          },
          tripType: { enum: ["ONE_WAY", "ROUND_TRIP"] },
          fromDate: { type: "string" },
          retDate: { type: "string" },
          fromCity: { type: "string" },
          fromAirport: { type: "string" },
          toCity: { type: "string" },
          toAirport: { type: "string" },
        },
      },
    },
  ],
};
