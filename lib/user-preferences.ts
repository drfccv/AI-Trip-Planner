export type UserTravelPreferences = {
  origin: string;
  currency: string;
  pace: string;
  transport: string;
};

export const defaultTravelPreferences: UserTravelPreferences = {
  origin: "",
  currency: "CNY",
  pace: "balanced",
  transport: "transit",
};

export const travelPreferencesKey = "lvji.travel-preferences.v1";
