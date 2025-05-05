// 用户输入表单类型
export interface TripFormData {
  city: string;
  startDate: string;
  endDate: string;
  travelDays: number;
  transportation: string;
  accommodation: string;
  preferences: string[];
  freeTextInput: string;
}

// 旅行计划类型
export interface TripPlan {
  city: string;
  startDate: string;
  endDate: string;
  days: DayPlan[];
  weatherInfo: WeatherInfo[];
  overallSuggestions: string;
}

// 单日行程类型
export interface DayPlan {
  date: string;
  dayIndex: number;
  attractions: Attraction[];
  meals: Meal[];
  transportation: string;
  accommodation: string;
  description: string;
}

// 景点类型
export interface Attraction {
  name: string;
  address: string;
  location: {
    longitude: number;
    latitude: number;
  };
  visitDuration: number; // 单位：分钟
  description: string;
  imageUrl?: string;
  rating?: number;
  category?: string;
}

// 餐饮类型
export interface Meal {
  type: 'breakfast' | 'lunch' | 'dinner' | 'snack';
  name: string;
  address?: string;
  location?: {
    longitude: number;
    latitude: number;
  };
  description?: string;
}

// 天气信息类型
export interface WeatherInfo {
  date: string;
  dayWeather: string;
  nightWeather: string;
  dayTemp: number;
  nightTemp: number;
  winddirection: string;
  windpower: string;
}

// 硅基流动API响应类型
export interface DeepseekResponse {
  result: string;
  tripPlan: TripPlan;
} 