const placeTypes = new Set(["城市", "机场", "景点", "火车站", "地铁站", "酒店", "区/县", "详细地址"]);
const cabins = new Set(["ECONOMY", "PREMIUM_ECONOMY", "BUSINESS", "FIRST"]);
const trips = new Set(["ONE_WAY", "ROUND_TRIP"]);
const date = /^\d{4}-\d{2}-\d{2}$/;
const text = (value: unknown) => typeof value === "string" && value.trim().length > 0;
export function validateRollingGoTool(provider: string, name: string, args: Record<string, unknown>) {
  if (provider === "dida" && name === "searchHotels") {
    if (!text(args.originQuery) || !text(args.place) || !placeTypes.has(String(args.placeType))) throw new Error("ROLLINGGO_HOTEL_SEARCH_INVALID");
    if (args.size !== undefined && (!Number.isInteger(args.size) || Number(args.size) < 1 || Number(args.size) > 20)) throw new Error("ROLLINGGO_HOTEL_SIZE_INVALID");
  }
  if (provider === "dida" && name === "getHotelDetail" && !Number.isFinite(args.hotelId) && !text(args.name)) throw new Error("ROLLINGGO_HOTEL_ID_OR_NAME_REQUIRED");
  if (provider === "didaFlight" && name === "searchAirports" && !text(args.keyword)) throw new Error("ROLLINGGO_AIRPORT_KEYWORD_REQUIRED");
  if (provider === "didaFlight" && name === "searchFlights") {
    const oneFrom = Number(text(args.fromCity)) + Number(text(args.fromAirport)); const oneTo = Number(text(args.toCity)) + Number(text(args.toAirport));
    if (!Number.isInteger(args.adultNumber) || Number(args.adultNumber) < 1 || !Number.isInteger(args.childNumber) || Number(args.childNumber) < 0 || !cabins.has(String(args.cabinGrade)) || !trips.has(String(args.tripType)) || !date.test(String(args.fromDate)) || oneFrom !== 1 || oneTo !== 1) throw new Error("ROLLINGGO_FLIGHT_SEARCH_INVALID");
    if (args.tripType === "ROUND_TRIP" && !date.test(String(args.retDate))) throw new Error("ROLLINGGO_FLIGHT_RETURN_DATE_REQUIRED");
  }
}
export function rollingGoDataWarnings(provider: string, tool: string) { if (provider === "dida" && tool === "searchHotels") return ["displayRate 仅为参考展示价，预订前必须调用 getHotelDetail", "description 可能包含 HTML，前端必须净化后渲染"]; if (provider === "dida" && tool === "getHotelDetail") return ["totalPrice=0 不代表免费", "实时价格仍以实际下单为准"]; if (provider === "didaFlight" && tool === "searchFlights") return ["航班价格和库存具有实时性，以实际下单为准"]; return []; }
