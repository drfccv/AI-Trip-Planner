import axios from 'axios';
import { ENV } from '../env';
import { TripFormData, DeepseekResponse, WeatherInfo, DayPlan, Meal } from '../types';
import { mockWeatherInfo, mockTripPlan } from '../utils/mockData';

// 是否使用模拟数据（开发环境下可以设置为true）
const USE_MOCK_DATA = true;
// 是否在错误时回退到模拟数据（生产环境推荐设置为false）
const USE_FALLBACK_DATA = false;
// 启用控制台显示
const ENABLE_CONSOLE_LOG = false;

// 设置API请求的超时时间（毫秒）
const API_TIMEOUT = 120000; // 增加到2分钟

// 最大重试次数
const MAX_RETRY_COUNT = 2;

// 重试延迟（毫秒）
const RETRY_DELAY = 2000;

// POI缓存，用于存储已查询过的景点信息，降低API调用消耗
const poiCache: Record<string, any> = {};

// 添加自定义日志函数
function log(...args: any[]): void {
  if (ENABLE_CONSOLE_LOG) {
    console.log(...args);
  }
}

function warn(...args: any[]): void {
  if (ENABLE_CONSOLE_LOG) {
    console.warn(...args);
  }
}

function error(...args: any[]): void {
  if (ENABLE_CONSOLE_LOG) {
    console.error(...args);
  }
}

// 添加一个新的函数，用于转换API返回的各种不同格式的数据结构到统一的应用程序格式
function standardizeTripPlanFormat(responseData: any, formData: TripFormData): any {
  // 检查是否有travel_plan字段（API可能返回这种格式而不是tripPlan）
  if (responseData.travel_plan && !responseData.tripPlan) {
    log('检测到travel_plan格式的API响应，将转换为tripPlan格式');
    
    const travelPlan = responseData.travel_plan;
    
    // 创建一个符合应用程序期望的tripPlan结构
    const standardized = {
      tripPlan: {
        city: formData.city,
        startDate: formData.startDate,
        endDate: formData.endDate,
        days: [],
        weatherInfo: [],
        overallSuggestions: travelPlan.overallSuggestions || "根据您的偏好和日程安排，我们为您精心设计了行程。建议提前查看各景点的开放时间，并根据天气情况适当调整行程。"
      }
    };
    
    // 转换days数组
    if (travelPlan.days && Array.isArray(travelPlan.days)) {
      standardized.tripPlan.days = travelPlan.days.map((day: any, index: number) => {
        // 创建标准格式的单日行程
        const standardDay: DayPlan = {
          date: day.date || new Date(new Date(formData.startDate).getTime() + index * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          dayIndex: index,
          description: `第${index + 1}天行程安排`,
          transportation: formData.transportation,
          accommodation: formData.accommodation,
          attractions: [],
          meals: []
        };
        
        // 转换景点数据
        if (day.activities && Array.isArray(day.activities)) {
          standardDay.attractions = day.activities
            .filter((activity: any) => activity.type === '景点' || activity.type === 'attraction')
            .map((attraction: any, attrIndex: number) => {
              // 创建随机但固定的经纬度（仅用于演示）
              const seed = (index * 10 + attrIndex) * 0.01;
              
              return {
                name: attraction.name,
                address: attraction.address || formData.city,
                location: attraction.location || {
                  // 使用一个固定的算法生成伪随机但稳定的经纬度
                  longitude: 116.3 + seed,
                  latitude: 39.9 + seed
                },
                visitDuration: attraction.suggested_duration ? 
                  parseInt(attraction.suggested_duration) * 60 || 120 : 120, // 将小时转换为分钟
                description: attraction.description || `${attraction.name}是${formData.city}的著名景点`,
                category: attraction.type || "景点"
              };
            });
        }
        
        // 转换餐饮数据
        if (day.meals) {
          const meals = day.meals;
          if (meals.breakfast) {
            standardDay.meals.push({
              type: 'breakfast',
              name: typeof meals.breakfast === 'string' ? 
                meals.breakfast : '早餐推荐',
              description: typeof meals.breakfast === 'string' ? 
                meals.breakfast : '早餐推荐'
            });
          }
          
          if (meals.lunch) {
            standardDay.meals.push({
              type: 'lunch',
              name: typeof meals.lunch === 'string' ? 
                '午餐推荐' : meals.lunch.name || '午餐推荐',
              description: typeof meals.lunch === 'string' ? 
                meals.lunch : meals.lunch.description || '午餐推荐'
            });
          }
          
          if (meals.dinner) {
            standardDay.meals.push({
              type: 'dinner',
              name: typeof meals.dinner === 'string' ? 
                '晚餐推荐' : meals.dinner.name || '晚餐推荐',
              description: typeof meals.dinner === 'string' ? 
                meals.dinner : meals.dinner.description || '晚餐推荐'
            });
          }
        }
        
        // 确保每天至少有3餐
        const mealTypes = ['breakfast', 'lunch', 'dinner'];
        const existingTypes = standardDay.meals.map((meal: Meal) => meal.type);
        
        mealTypes.forEach(type => {
          if (!existingTypes.includes(type as any)) {
            standardDay.meals.push({
              type: type as 'breakfast' | 'lunch' | 'dinner',
              name: `第${index + 1}天${type === 'breakfast' ? '早餐' : type === 'lunch' ? '午餐' : '晚餐'}推荐`,
              description: `第${index + 1}天${type === 'breakfast' ? '早餐' : type === 'lunch' ? '午餐' : '晚餐'}推荐`
            });
          }
        });
        
        return standardDay;
      });
    }
    
    return standardized;
  }
  
  // 原始API响应格式已经符合预期
  return responseData;
}

// 添加专门解析DeepSeek API响应的函数
function parseDeepseekResponse(responseData: any): any {
  try {
    // 检查响应格式是否符合预期
    if (responseData.choices && 
        responseData.choices.length > 0 && 
        responseData.choices[0].message && 
        responseData.choices[0].message.content) {
      
      // 获取内容字符串
      const content = responseData.choices[0].message.content;
      
      // 尝试直接解析JSON
      try {
        const parsedData = JSON.parse(content);
        return parsedData;
      } catch (directParseError) {
        error('直接解析API响应内容失败:', directParseError);
        
        // 预处理JSON文本 - 去除可能导致解析失败的字符
        const cleanedContent = content
          .trim()
          .replace(/\n/g, ' ')                  // 移除换行符
          .replace(/\r/g, '')                   // 移除回车符
          .replace(/\\n/g, ' ')                 // 移除转义的换行符
          .replace(/\\"/g, '"')                 // 修复转义的引号
          .replace(/"{/g, '{')                  // 移除开头多余的引号
          .replace(/}"/g, '}')                  // 移除结尾多余的引号
          .replace(/([0-9]),\s*"([a-zA-Z])/g, '$1,"$2')   // 修复数字后面缺少引号的问题
          .replace(/\}\s*,\s*\]/g, '}]')        // 修复数组末尾多余的逗号
          .replace(/,\s*\}/g, '}');             // 修复对象末尾多余的逗号
        
        try {
          return JSON.parse(cleanedContent);
        } catch (cleanParseError) {
          error('清理后解析API响应内容失败:', cleanParseError);
          
          // 尝试提取JSON部分
          const jsonMatch = content.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            try {
              return JSON.parse(jsonMatch[0]);
            } catch (matchError) {
              error('提取JSON部分后解析失败:', matchError);
            }
          }
          
          // 使用更激进的方法 - 直接替换问题位置
          const fixedContent = content
            .replace(/("longitude"\s*:\s*[0-9.]+)\s*,\s*("latitude")/g, '$1,"$2')
            .replace(/("latitude"\s*:\s*[0-9.]+)\s*\}/g, '$1}')
            .replace(/("visitDuration"\s*:\s*[0-9]+)\s*,/g, '$1,')
            .replace(/("category"\s*:\s*"[^"]*")\s*\}/g, '$1}');
            
          try {
            return JSON.parse(fixedContent);
          } catch (finalError) {
            error('所有修复方法都失败:', finalError);
            throw new Error('无法解析API返回的JSON数据');
          }
        }
      }
    }
    
    throw new Error('API响应格式不符合预期');
  } catch (err) {
    error('解析DeepSeek API响应失败:', err);
    throw err;
  }
}

// 处理高德地图天气API返回的数据
export function processWeatherData(data: any): WeatherInfo[] {
  if (!data || !Array.isArray(data)) {
    warn('天气数据格式不正确:', data);
    return [];
  }
  
  // 将高德天气API返回的数据转换为应用需要的格式
  return data.map((item: any) => {
    // 日期格式转换: YYYYMMDD -> YYYY-MM-DD
    const dateStr = item.date;
    let formattedDate = dateStr;
    if (dateStr && dateStr.length === 8) {
      formattedDate = `${dateStr.substring(0, 4)}-${dateStr.substring(4, 6)}-${dateStr.substring(6, 8)}`;
    }

    return {
      date: formattedDate,
      dayWeather: item.dayweather || '未知',
      nightWeather: item.nightweather || '未知',
      dayTemp: parseInt(item.daytemp) || 0,
      nightTemp: parseInt(item.nighttemp) || 0,
      winddirection: item.daywind || '未知',
      windpower: item.daypower || '未知'
    };
  });
}

// 获取天气信息
export async function getWeatherInfo(city: string): Promise<WeatherInfo[]> {
  if (USE_MOCK_DATA) {
    return mockWeatherInfo;
  }

  // 使用AMap.Weather JS API代替Web服务API
  return new Promise((resolve, reject) => {
    try {
      // 检查window.AMap是否已加载
      if (typeof window.AMap === 'undefined') {
        warn('AMap JS API尚未加载完成');
        if (!USE_FALLBACK_DATA) {
          reject(new Error('高德地图API尚未加载完成，无法获取天气信息'));
          return;
        }
        return resolve([]);
      }

      log(`使用AMap.Weather JS API获取${city}的天气信息`);
      // 创建Weather实例并获取天气预报
      window.AMap.plugin(['AMap.Weather'], () => {
        // 构造Weather类
        const amapWeather = new window.AMap.Weather();
        
        // 查询四天预报天气
        amapWeather.getForecast(city);
        
        // 成功获取天气数据
        window.AMap.event.addListener(amapWeather, 'complete', (data: any) => {
          log('天气API响应:', data);
          
          if (data && data.forecasts && Array.isArray(data.forecasts)) {
            // 将高德天气数据转换为应用需要的格式
            const weatherData = data.forecasts.map((item: any) => ({
              date: item.date,
              dayWeather: item.dayWeather || '未知',
              nightWeather: item.nightWeather || '未知',
              dayTemp: parseInt(item.dayTemp) || 0,
              nightTemp: parseInt(item.nightTemp) || 0,
              winddirection: item.dayWindDirection || '未知',
              windpower: item.dayWindPower || '未知'
            }));
            
            resolve(weatherData);
          } else {
            warn('天气数据格式不正确:', data);
            if (!USE_FALLBACK_DATA) {
              reject(new Error('无法解析天气数据'));
              return;
            }
            resolve([]);
          }
        });
        
        // 天气查询失败
        window.AMap.event.addListener(amapWeather, 'error', (err: any) => {
          error('获取天气信息出错:', err);
          if (!USE_FALLBACK_DATA) {
            reject(new Error('获取天气信息失败'));
            return;
          }
          resolve([]);
        });
      });
    } catch (err) {
      error('天气API调用出错:', err);
      if (!USE_FALLBACK_DATA) {
        reject(error instanceof Error ? error : new Error('获取天气信息时发生未知错误'));
        return;
      }
      resolve([]);
    }
  });
}

// 创建多天行程的辅助函数
function createMultiDayTrip(parsedData: any, formData: TripFormData): any {
  log('处理API返回的行程数据，确保生成多天行程');
  
  // 如果没有days数组或不是数组，创建一个空数组
  if (!parsedData.tripPlan || !parsedData.tripPlan.days || !Array.isArray(parsedData.tripPlan.days)) {
    warn('API返回的数据没有有效的days数组，将创建新的数组');
    parsedData.tripPlan.days = [];
  }
  
  // 记录API返回的天数
  const originalDaysCount = parsedData.tripPlan.days.length;
  log(`API返回的行程天数: ${originalDaysCount}, 请求的天数: ${formData.travelDays}`);
  
  // 确保每天的索引正确
  parsedData.tripPlan.days.forEach((day: DayPlan, index: number) => {
    day.dayIndex = index;
    
    // 确保日期正确
    if (!day.date) {
      const newDate: Date = new Date(new Date(formData.startDate).getTime() + index * 24 * 60 * 60 * 1000);
      day.date = newDate.toISOString().split('T')[0];
    }
    
    // 如果attractions不存在或不是数组，初始化为空数组
    if (!day.attractions || !Array.isArray(day.attractions)) {
      day.attractions = [];
    }
      
      // 所需的餐食类型
      const requiredMealTypes: ('breakfast' | 'lunch' | 'dinner')[] = ['breakfast', 'lunch', 'dinner'];
      
      // 检查已有的餐食类型
      const existingTypes: ('breakfast' | 'lunch' | 'dinner')[] = day.meals
        .map((meal: Meal) => meal.type)
        .filter((type): type is 'breakfast' | 'lunch' | 'dinner' => ['breakfast', 'lunch', 'dinner'].includes(type));
      
      // 添加缺失的餐食
      for (const mealType of requiredMealTypes) {
        if (!existingTypes.includes(mealType)) {
          let mealName: string, mealDesc: string;
          
          if (mealType === 'breakfast') {
            mealName = '当地特色早餐';
            mealDesc = '推荐尝试当地的早餐小吃，开启美好的一天';
          } else if (mealType === 'lunch') {
            mealName = '午餐推荐';
            mealDesc = '在游览景点附近的餐厅享用午餐，补充能量';
          } else {
            mealName = '晚餐推荐';
            mealDesc = '品尝当地特色美食，结束一天的行程';
          }
          
          day.meals.push({
            type: mealType,
            name: `第${index+1}天 ${mealName}`,
            description: `第${index+1}天 ${mealDesc}`
          } as Meal);
        }
      }
    }
  )
  
  // 排序确保按日期顺序
  parsedData.tripPlan.days.sort((a: DayPlan, b: DayPlan) => a.dayIndex - b.dayIndex);
  
  return parsedData;
}

// 添加一个重试函数
interface RetryableAxiosRequestFn {
  (): Promise<any>;
}

async function retryableAxiosRequest(
  requestFn: RetryableAxiosRequestFn, 
  maxRetries: number = MAX_RETRY_COUNT, 
  delay: number = RETRY_DELAY
): Promise<any> {
  let lastError: unknown;
  for (let retryCount = 0; retryCount <= maxRetries; retryCount++) {
    try {
      if (retryCount > 0) {
        log(`正在进行第${retryCount}次重试...`);
        // 使用延迟确保不立即重试
        await new Promise(resolve => setTimeout(resolve, delay));
      }
      return await requestFn();
    } catch (error) {
      lastError = error;
      if (axios.isAxiosError(error)) {
        // 只有在超时或网络错误等可能因临时原因导致的错误时才重试
        if (error.code === 'ECONNABORTED' || error.message.includes('timeout') || 
            !error.response || error.response.status >= 500) {
          log(`请求失败，${retryCount < maxRetries ? '将重试' : '已达到最大重试次数'}:`, error.message);
          continue;
        }
        // 对于其他错误（如400错误），不再重试
        break;
      }
      // 非Axios错误也不重试
      break;
    }
  }
  throw lastError; // 所有重试失败后抛出最后一个错误
}

// 高德地图POI搜索
export async function searchPOIByKeyword(keyword: string, city: string) {
  // 构建缓存键
  const cacheKey = `${keyword}_${city}`;

  // 检查缓存中是否已有该查询结果
  if (poiCache[cacheKey]) {
    log(`使用缓存的POI数据: ${cacheKey}`);
    return poiCache[cacheKey];
  }

  if (USE_MOCK_DATA) {
    // 模拟POI数据
    const mockResult = {
      status: '1',
      count: '5',
      info: 'OK',
      pois: mockTripPlan.days.flatMap(day => day.attractions).map(attr => ({
        id: Math.random().toString(36).substring(2, 10),
        name: attr.name,
        type: attr.category,
        address: attr.address,
        location: `${attr.location.longitude},${attr.location.latitude}`,
        tel: '',
        photos: []
      }))
    };
    
    // 缓存模拟数据
    poiCache[cacheKey] = mockResult;
    return mockResult;
  }

  try {
    // 修正高德POI搜索参数，确保只在指定城市内搜索
    const response = await retryableAxiosRequest(() => axios.get('https://restapi.amap.com/v5/place/text', {
      params: {
        key: ENV.AMAP_API_KEY,
        keywords: keyword,
        city: city, // 使用city参数
        citylimit: true // 官方参数为citylimit
      },
      timeout: API_TIMEOUT
    }));
    
    // 将结果存入缓存
    poiCache[cacheKey] = response.data;
    return response.data;
  } catch (err) {
    error('搜索POI出错:', err);
    throw err;
  }
}

// 根据POI ID直接查询POI详情（减少API调用）
export async function getPOIById(id: string) {
  // 检查缓存中是否已有该ID的查询结果
  if (poiCache[id]) {
    log(`使用缓存的POI ID数据: ${id}`);
    return poiCache[id];
  }

  if (USE_MOCK_DATA) {
    // 模拟POI详情数据
    const mockResult = {
      status: '1',
      info: 'OK',
      poi: mockTripPlan.days[0].attractions[0]
    };
    
    // 缓存模拟数据
    poiCache[id] = mockResult;
    return mockResult;
  }

  try {
    // 使用ID查询POI详情
    const response = await retryableAxiosRequest(() => axios.get('https://restapi.amap.com/v5/place/detail', {
      params: {
        key: ENV.AMAP_API_KEY,
        id: id
      },
      timeout: API_TIMEOUT
    }));
    
    // 将结果存入缓存
    poiCache[id] = response.data;
    return response.data;
  } catch (err) {
    error('查询POI详情出错:', err);
    throw error;
  }
}

// 批量查询景点POI信息
export async function batchGetAttractionPOIInfo(attractions: { name: string, city: string }[]) {
  // 过滤掉已缓存的景点
  const uncachedAttractions = attractions.filter(attr => {
    const cacheKey = `${attr.name.replace(/^第\d+天景点:\s*/, '').trim()}_${attr.city}`;
    return !poiCache[cacheKey];
  });

  if (uncachedAttractions.length === 0) {
    // 所有景点都已缓存
    return attractions.map(attr => {
      const cleanName = attr.name.replace(/^第\d+天景点:\s*/, '').trim();
      const cacheKey = `${cleanName}_${attr.city}`;
      const cachedData = poiCache[cacheKey];
      
      if (cachedData && cachedData.pois && cachedData.pois.length > 0) {
        const poi = cachedData.pois[0];
        let longitude = 0, latitude = 0;
        if (poi.location) {
          const locationParts = poi.location.split(',');
          if (locationParts.length === 2) {
            longitude = parseFloat(locationParts[0]);
            latitude = parseFloat(locationParts[1]);
          }
        }
        
        return {
          name: cleanName,
          address: poi.address || poi.pname + poi.cityname + poi.adname + poi.name,
          location: {
            longitude,
            latitude
          },
          rating: poi.rating || (4 + Math.random()).toFixed(1),
          category: poi.type || "景点"
        };
      }
      
      // 如果缓存中没有，使用默认值（不应该到达这一步）
      return {
        name: cleanName,
        address: `${attr.city}市${cleanName}`,
        location: {
          longitude: 116.3 + Math.random() * 0.1,
          latitude: 39.9 + Math.random() * 0.1
        },
        rating: (4 + Math.random()).toFixed(1),
        category: "景点"
      };
    });
  }

  // 如果有未缓存的景点，为每个未缓存的景点执行单独的异步请求
  const results = await Promise.all(
    attractions.map(async (attr) => {
      const cleanName = attr.name.replace(/^第\d+天景点:\s*/, '').trim();
      const cacheKey = `${cleanName}_${attr.city}`;
      
      // 如果已经缓存，直接使用缓存数据
      if (poiCache[cacheKey] && poiCache[cacheKey].pois && poiCache[cacheKey].pois.length > 0) {
        const poi = poiCache[cacheKey].pois[0];
        let longitude = 0, latitude = 0;
        if (poi.location) {
          const locationParts = poi.location.split(',');
          if (locationParts.length === 2) {
            longitude = parseFloat(locationParts[0]);
            latitude = parseFloat(locationParts[1]);
          }
        }
        
        return {
          name: cleanName,
          address: poi.address || poi.pname + poi.cityname + poi.adname + poi.name,
          location: {
            longitude,
            latitude
          },
          rating: poi.rating || (4 + Math.random()).toFixed(1),
          category: poi.type || "景点"
        };
      }
      
      // 否则调用API获取数据
      return await getAttractionPOIInfo(attr.name, attr.city);
    })
  );
  
  return results;
}

// 根据景点名称和城市获取准确的POI信息
export async function getAttractionPOIInfo(attractionName: string, city: string) {
  // 移除景点名称中可能包含的"第X天景点:"等前缀，以提高搜索准确性
  const cleanName = attractionName.replace(/^第\d+天景点:\s*/, '').trim();
  
  // 构建缓存键
  const cacheKey = `${cleanName}_${city}`;
  
  // 检查缓存中是否已有该查询结果
  if (poiCache[cacheKey]) {
    log(`使用缓存的景点POI信息: ${cacheKey}`);
    const cachedData = poiCache[cacheKey];
    
    if (cachedData.pois && cachedData.pois.length > 0) {
      const poi = cachedData.pois[0];
      let longitude = 0, latitude = 0;
      if (poi.location) {
        const locationParts = poi.location.split(',');
        if (locationParts.length === 2) {
          longitude = parseFloat(locationParts[0]);
          latitude = parseFloat(locationParts[1]);
        }
      }
      
      return {
        name: cleanName,
        address: poi.address || poi.pname + poi.cityname + poi.adname + poi.name,
        location: {
          longitude,
          latitude
        },
        rating: poi.rating || (4 + Math.random()).toFixed(1),
        category: poi.type || "景点"
      };
    }
  }

  if (USE_MOCK_DATA) {
    // 返回模拟POI数据
    const mockResult = {
      name: cleanName,
      address: `${city}市${cleanName}附近`,
      location: {
        longitude: 116.3 + Math.random() * 0.1,
        latitude: 39.9 + Math.random() * 0.1
      },
      rating: (3.5 + Math.random() * 1.5).toFixed(1),
      category: "景点"
    };
    
    // 缓存模拟数据（模拟API返回格式）
    poiCache[cacheKey] = {
      status: '1',
      pois: [{
        id: Math.random().toString(36).substring(2, 10),
        name: cleanName,
        type: "景点",
        address: `${city}市${cleanName}附近`,
        location: `${mockResult.location.longitude},${mockResult.location.latitude}`,
        rating: mockResult.rating
      }]
    };
    
    return mockResult;
  }

  try {
    log(`开始搜索景点POI信息: ${cleanName}, 城市: ${city}`);
    // 使用高德地图POI搜索API，参数与searchPOIByKeyword保持一致
    const response = await retryableAxiosRequest(() => axios.get('https://restapi.amap.com/v5/place/text', {
      params: {
        key: ENV.AMAP_API_KEY,
        keywords: cleanName,
        city: city, // 使用city参数
        citylimit: true // 官方参数为citylimit
      },
      timeout: API_TIMEOUT
    }));
    
    // 将结果存入缓存
    poiCache[cacheKey] = response.data;
    
    if (response.data.status === '1' && response.data.pois && response.data.pois.length > 0) {
      // 找到POI数据
      const poi = response.data.pois[0]; // 使用第一个结果
      log(`成功获取到景点 "${cleanName}" 的POI信息`);
      // 解析经纬度坐标
      let longitude = 0, latitude = 0;
      if (poi.location) {
        const locationParts = poi.location.split(',');
        if (locationParts.length === 2) {
          longitude = parseFloat(locationParts[0]);
          latitude = parseFloat(locationParts[1]);
        }
      }
      // 生成评分 (如果API没有提供评分，生成一个随机评分)
      const rating = poi.rating || (4 + Math.random()).toFixed(1);
      return {
        name: cleanName,
        address: poi.address || poi.pname + poi.cityname + poi.adname + poi.name,
        location: {
          longitude,
          latitude
        },
        rating: rating,
        category: poi.type || "景点"
      };
    } else {
      warn(`未找到景点 "${cleanName}" 的POI信息`);
      // 返回一个兜底的位置（该城市的中心点位置）
      try {
        // 检查缓存中是否已有该城市的中心点
        const cityCenterCacheKey = `city_center_${city}`;
        let cityCenter;
        
        if (poiCache[cityCenterCacheKey]) {
          cityCenter = poiCache[cityCenterCacheKey];
          log(`使用缓存的城市中心点: ${city}`);
        } else {
          const geocodeResponse = await retryableAxiosRequest(() => axios.get('https://restapi.amap.com/v3/geocode/geo', {
            params: {
              key: ENV.AMAP_API_KEY,
              address: city,
              city: city
            },
            timeout: API_TIMEOUT
          }));
          
          if (geocodeResponse.data.status === '1' && 
              geocodeResponse.data.geocodes && 
              geocodeResponse.data.geocodes.length > 0) {
            cityCenter = geocodeResponse.data.geocodes[0].location;
            // 缓存城市中心点
            poiCache[cityCenterCacheKey] = cityCenter;
          }
        }
        
        if (cityCenter) {
          const locationParts = cityCenter.split(',');
          if (locationParts.length === 2) {
            return {
              name: cleanName,
              address: `${city}市${cleanName}`,
              location: {
                longitude: parseFloat(locationParts[0]),
                latitude: parseFloat(locationParts[1])
              },
              rating: (4 + Math.random()).toFixed(1),
              category: "景点"
            };
          }
        }
      } catch (geocodeError) {
        error('获取城市中心点坐标失败:', geocodeError);
      }
      // 如果城市坐标也获取失败，返回一个默认值
      const defaultResult = {
        name: cleanName,
        address: `${city}市${cleanName}`,
        location: {
          longitude: 116.3 + Math.random() * 0.1,
          latitude: 39.9 + Math.random() * 0.1
        },
        rating: (4 + Math.random()).toFixed(1),
        category: "景点"
      };
      
      // 缓存默认结果
      poiCache[cacheKey] = {
        status: '1',
        pois: [{
          id: Math.random().toString(36).substring(2, 10),
          name: cleanName,
          type: "景点",
          address: `${city}市${cleanName}`,
          location: `${defaultResult.location.longitude},${defaultResult.location.latitude}`,
          rating: defaultResult.rating
        }]
      };
      
      return defaultResult;
    }
  } catch (err) {
    error(`搜索景点POI信息失败 (${cleanName}):`, err);
    // 出错时返回一个默认值
    return {
      name: cleanName,
      address: `${city}市${cleanName}`,
      location: {
        longitude: 116.3 + Math.random() * 0.1,
        latitude: 39.9 + Math.random() * 0.1
      },
      rating: (4 + Math.random()).toFixed(1),
      category: "景点"
    };
  }
}

// 高德地图路线规划
export async function getRouteDirection(
  origin: [number, number], 
  destination: [number, number], 
  type: 'walking' | 'driving' | 'transit' = 'driving'
) {
  if (USE_MOCK_DATA) {
    // 模拟路线数据
    return {
      status: '1',
      info: 'OK',
      route: {
        paths: [
          {
            distance: 5000,
            duration: 1200,
            steps: []
          }
        ]
      }
    };
  }

  try {
    const response = await retryableAxiosRequest(() => axios.get(`https://restapi.amap.com/v5/direction/${type}`, {
      params: {
        key: ENV.AMAP_API_KEY,
        origin: origin.join(','),
        destination: destination.join(','),
        show_fields: 'cost,restriction,tmcs'
      },
      timeout: API_TIMEOUT
    }));
    return response.data;
  } catch (err) {
    error('路线规划出错:', err);
    throw err;
  }
}

// 调用硅基流动API生成旅行计划
export async function generateTripPlan(formData: TripFormData): Promise<DeepseekResponse> {
  if (USE_MOCK_DATA) {
    // 使用模拟数据
    await new Promise(resolve => setTimeout(resolve, 2000)); // 模拟延迟
    
    // 根据表单数据调整模拟数据
    const customizedTripPlan = {
      ...mockTripPlan,
      city: formData.city,
      startDate: formData.startDate,
      endDate: formData.endDate,
      days: mockTripPlan.days.slice(0, formData.travelDays).map((day, index) => ({
        ...day,
        date: new Date(new Date(formData.startDate).getTime() + index * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        dayIndex: index,
        transportation: formData.transportation,
        accommodation: formData.accommodation
      }))
    };
    
    return {
      result: 'success',
      tripPlan: customizedTripPlan
    };
  }

  try {
    // 使用代理路径替代直接访问API
    const response = await retryableAxiosRequest(() => axios.post('https://api.siliconflow.cn/v1/chat/completions', {
      model: "Qwen/Qwen3-235B-A22B",
      messages: [
        {
          role: "system",
          content: `你是一个专业的旅行规划助手，擅长根据用户需求定制个性化旅行计划。

【生成原则】
1. 必须根据用户指定的旅行天数（X天）动态生成X天的完整行程
2. 每天应安排多个景点，根据景点规模、游览价值和距离合理分配
3. 考虑用户的交通方式和住宿偏好，设计合理的游览路线
4. 针对用户提供的偏好标签（如"美食"、"历史"、"自然风光"等），优先推荐相关景点
5. 确保返回标准JSON格式，所有字段完整有效

【输出格式】
请按照以下JSON结构返回行程计划（注意：days数组长度必须与用户指定的旅行天数一致）：
{
  "travel_plan": {
    "destination": "用户指定的目的地",
    "start_date": "用户指定的开始日期",
    "end_date": "用户指定的结束日期",
    "duration": 用户指定的天数(整数),
    "accommodation": "用户指定的住宿类型",
    "transportation": "用户指定的交通方式",
    "days": [
      // 这里应该有与用户指定天数相同数量的日程对象
      {
        "day": 天数序号(从1开始),
        "date": "具体日期(YYYY-MM-DD格式)",
        "activities": [
          // 每天景点活动(合理范围内尽量多安排，除非用户另外要求)
          {
            "type": "景点",
            "name": "景点名称",
            "description": "景点描述(100-200字)",
            "suggested_duration": "建议游览时间(小时)",
            "tips": "实用建议"
          }
          // 可以有多个景点，不需要写注释
        ],
        "meals": {
          "breakfast": "早餐建议",
          "lunch": "午餐建议",
          "dinner": "晚餐建议"
        }
      }
      // 重复上述日程结构，直到达到用户指定的天数
    ]
  }
}`
        },
        {
          role: "user",
          content: `请帮我规划一次${formData.city}旅行，从${formData.startDate}到${formData.endDate}，共${Number(formData.travelDays)}天。
出行方式：${formData.transportation}
住宿选择：${formData.accommodation}
旅行偏好：${formData.preferences.join('，')}
额外要求：${formData.freeTextInput}

请特别注意：
1. 必须安排${Number(formData.travelDays)}天的行程，不多不少
2. 根据景点类型、距离和游览时间，每天合理安排多个景点(建议更加充实，除非偏好内另有提及)
3. 考虑我的交通方式(${formData.transportation})，合理规划游览顺序
4. 根据我的偏好(${formData.preferences.join('，')})推荐适合的景点和餐饮
5. 返回标准JSON格式，确保完整且无语法错误`
        }
      ],
      response_format: { type: "json_object" },
      stream: false,
      max_tokens: 8192,
      enable_thinking: false,
      thinking_budget: 4096,
      min_p: 0.00,
      temperature: 0.6,
      top_p: 0.7,
      top_k: 50,
      frequency_penalty: 0.0,
      n: 1,
      stop: []
    }, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${ENV.DEEPSEEK_API_KEY}`
      },
      timeout: API_TIMEOUT
    }));

    // 解析响应
    try {
      // 使用专门的解析函数解析DeepSeek API响应
      if (response.data && response.data.choices && response.data.choices.length > 0) {
        try {
          // 尝试使用新的专用解析函数
          const parsedData = parseDeepseekResponse(response.data);
          
          // 使用新的标准化函数处理不同的数据格式
          const standardizedData = standardizeTripPlanFormat(parsedData, formData);
          
          // 检查解析后的数据
          if (standardizedData && (standardizedData.tripPlan || (standardizedData.travel_plan && !standardizedData.tripPlan))) {
            log('成功解析API响应数据，开始处理行程');
            
            // 确保数据有tripPlan字段
            const dataToProcess = standardizedData.tripPlan ? standardizedData : standardizedData;
            
            // 创建多天行程 - 解决dayIndex始终为1的问题
            const processedData = createMultiDayTrip(dataToProcess, formData);
            
            // 返回处理后的结果
            return {
              result: 'success',
              tripPlan: processedData.tripPlan
            };
          } else {
            error('API返回的数据不包含tripPlan对象');
            throw new Error('API返回的数据不包含旅行计划信息');
          }
        } catch (parseError) {
          error('使用新解析函数处理API响应失败:', parseError);
          
          // 尝试使用旧方法解析
          const content = response.data.choices[0].message.content;
          log('尝试使用旧方法解析API响应内容');
          
          try {
            // 使用旧方法尝试解析
            const cleanedContent = content
              .trim()
              .replace(/\n/g, ' ')
              .replace(/\\n/g, ' ')
              .replace(/\\"/g, '"');
              
            const parsedData = JSON.parse(cleanedContent);
            
            if (parsedData && parsedData.tripPlan) {
              log('使用旧方法成功解析API响应数据');
              
              // 使用多天行程处理函数处理数据
              const processedData = createMultiDayTrip(parsedData, formData);
              
              return {
                result: 'success',
                tripPlan: processedData.tripPlan
              };
            }
          } catch (oldMethodError) {
            error('旧方法解析API响应也失败:', oldMethodError);
          }
          
          // 如果不允许回退到模拟数据，直接抛出错误
          if (!USE_FALLBACK_DATA) {
            throw new Error('无法解析API返回的数据，请检查API响应格式');
          }
          
          // 回退到模拟数据
          warn('所有解析方法均失败，回退到模拟数据');
          return {
            result: 'fallback-parse-failed',
            tripPlan: {
              ...mockTripPlan,
              city: formData.city,
              startDate: formData.startDate,
              endDate: formData.endDate,
              days: mockTripPlan.days.slice(0, formData.travelDays).map((day, index) => ({
                ...day,
                date: new Date(new Date(formData.startDate).getTime() + index * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
                dayIndex: index,
                transportation: formData.transportation,
                accommodation: formData.accommodation
              }))
            }
          };
        }
      } else {
        error('API响应格式不正确，缺少必要的choices字段');
        throw new Error('API响应格式不正确');
      }
    } catch (err) {
      error('解析API响应时出错:', err);
      
      // 如果不允许回退到模拟数据，直接抛出错误
      if (!USE_FALLBACK_DATA) {
        throw error;
      }
      
      // 回退到模拟数据
      return {
        result: 'fallback',
        tripPlan: {
          ...mockTripPlan,
          city: formData.city,
          startDate: formData.startDate,
          endDate: formData.endDate,
          days: mockTripPlan.days.slice(0, formData.travelDays).map((day, index) => ({
            ...day,
            date: new Date(new Date(formData.startDate).getTime() + index * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
            dayIndex: index,
            transportation: formData.transportation,
            accommodation: formData.accommodation
          }))
        }
      };
    }
  } catch (err) {
    error('生成旅行计划出错:', err);
    
    if (axios.isAxiosError(err)) {
      const status = err.response?.status;
      const message = err.response?.data?.message;
      
      // 记录错误信息
      if (status === 400) {
        error('请求参数错误:', message);
      } else if (status === 401) {
        error('API Key无效');
      } else if (status === 403) {
        error('权限不足，可能需要实名认证:', message);
      } else if (status === 429) {
        error('触发限流:', message);
      } else if (status === 503 || status === 504) {
        error('服务负载高，稍后重试');
      } else if (err.code === 'ECONNABORTED') {
        error('请求超时');
      }
      
      // 如果不允许回退到模拟数据，直接抛出错误
      if (!USE_FALLBACK_DATA) {
        throw err;
      }
      
      // 回退到模拟数据
      return {
        result: 'fallback',
        tripPlan: {
          ...mockTripPlan,
          city: formData.city,
          startDate: formData.startDate,
          endDate: formData.endDate,
          days: mockTripPlan.days.slice(0, formData.travelDays).map((day, index) => ({
            ...day,
            date: new Date(new Date(formData.startDate).getTime() + index * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
            dayIndex: index,
            transportation: formData.transportation,
            accommodation: formData.accommodation
          }))
        }
      };
    }
    
    throw err;
  }
}
