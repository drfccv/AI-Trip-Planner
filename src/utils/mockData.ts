import { TripPlan, WeatherInfo } from '../types';

// 模拟天气数据
export const mockWeatherInfo: WeatherInfo[] = [
  {
    date: '2023-05-01',
    dayWeather: '晴',
    nightWeather: '多云',
    dayTemp: 28,
    nightTemp: 18,
    winddirection: '东南',
    windpower: '3级'
  },
  {
    date: '2023-05-02',
    dayWeather: '多云',
    nightWeather: '阴',
    dayTemp: 26,
    nightTemp: 17,
    winddirection: '东南',
    windpower: '3级'
  },
  {
    date: '2023-05-03',
    dayWeather: '阴',
    nightWeather: '小雨',
    dayTemp: 25,
    nightTemp: 16,
    winddirection: '东北',
    windpower: '4级'
  }
];

// 模拟旅行计划数据
export const mockTripPlan: TripPlan = {
  city: '南昌市',
  startDate: '2023-05-01',
  endDate: '2023-05-03',
  days: [
    {
      date: '2023-05-01',
      dayIndex: 0,
      description: '第一天以游览南昌市中心和红色景点为主，了解南昌的革命历史和文化，晚上可以欣赏赣江夜景。',
      transportation: '公共交通',
      accommodation: '经济型酒店',
      attractions: [
        {
          name: '八一起义纪念馆',
          address: '江西省南昌市东湖区中山路380号',
          location: {
            longitude: 115.892447,
            latitude: 28.684274
          },
          visitDuration: 120,
          description: '八一起义纪念馆是为纪念1927年8月1日南昌起义而建立的纪念馆，是全国重点文物保护单位和爱国主义教育基地。',
          rating: 4.8,
          category: '红色景点'
        },
        {
          name: '滕王阁',
          address: '江西省南昌市西湖区滕王阁路13号',
          location: {
            longitude: 115.889188,
            latitude: 28.676929
          },
          visitDuration: 90,
          description: '滕王阁是南昌市的标志性建筑，始建于唐永徽四年（653年），因唐太宗李世民之弟滕王李元婴而得名，是江南三大名楼之一。',
          rating: 4.9,
          category: '人文古迹'
        },
        {
          name: '南昌之星摩天轮',
          address: '江西省南昌市红谷滩新区凤凰中大道与赣江南大道交叉口',
          location: {
            longitude: 115.858002,
            latitude: 28.650751
          },
          visitDuration: 60,
          description: '南昌之星摩天轮是亚洲最大的观光摩天轮之一，高达160米，有60个观光舱，可以俯瞰整个南昌市区和赣江风光。',
          rating: 4.7,
          category: '现代景点'
        }
      ],
      meals: [
        {
          type: 'breakfast',
          name: '酒店早餐',
          description: '酒店提供的中式早餐'
        },
        {
          type: 'lunch',
          name: '南昌米粉',
          address: '八一广场附近的小吃街',
          description: '尝尝正宗的南昌米粉，推荐加辣，口感更佳'
        },
        {
          type: 'dinner',
          name: '小海鲜餐厅',
          address: '青山湖区北京东路156号',
          description: '品尝当地特色海鲜，推荐尝试鄱阳湖银鱼和河蟹'
        }
      ]
    },
    {
      date: '2023-05-02',
      dayIndex: 1,
      description: '第二天前往南昌市郊的自然景点，感受江西的山水风光和生态环境，放松身心。',
      transportation: '公共交通 + 出租车',
      accommodation: '经济型酒店',
      attractions: [
        {
          name: '梅岭国家森林公园',
          address: '江西省南昌市湾里区梅岭街道',
          location: {
            longitude: 115.775235,
            latitude: 28.677316
          },
          visitDuration: 180,
          description: '梅岭国家森林公园是南昌市著名的避暑胜地，森林覆盖率高达95%以上，气候宜人，景色优美，有"小庐山"之称。',
          rating: 4.6,
          category: '自然风光'
        },
        {
          name: '南昌动物园',
          address: '江西省南昌市西湖区象山南路99号',
          location: {
            longitude: 115.863662,
            latitude: 28.642767
          },
          visitDuration: 150,
          description: '南昌动物园是江西省规模最大的综合性动物园，有丰富多样的野生动物，适合亲子游览。',
          rating: 4.4,
          category: '休闲娱乐'
        },
        {
          name: '南昌市博物馆',
          address: '江西省南昌市西湖区三经路396号',
          location: {
            longitude: 115.901243,
            latitude: 28.688236
          },
          visitDuration: 90,
          description: '南昌市博物馆收藏了大量的历史文物和艺术品，展示了江西悠久的历史文化和艺术成就。',
          rating: 4.5,
          category: '人文古迹'
        }
      ],
      meals: [
        {
          type: 'breakfast',
          name: '酒店早餐',
          description: '酒店提供的中式早餐'
        },
        {
          type: 'lunch',
          name: '瓦罐汤',
          address: '梅岭脚下的农家乐',
          description: '品尝当地特色的瓦罐汤，煨制时间长，味道鲜美'
        },
        {
          type: 'dinner',
          name: '南昌饭店',
          address: '江西省南昌市西湖区抚河北路98号',
          description: '品尝正宗的江西菜，如酱板鸭、瓦罐汤、藜蒿炒腊肉等'
        }
      ]
    },
    {
      date: '2023-05-03',
      dayIndex: 2,
      description: '第三天以文化体验和购物为主，体验南昌的现代生活和文化艺术，购买当地特产和纪念品。',
      transportation: '公共交通',
      accommodation: '返程',
      attractions: [
        {
          name: '江西省博物馆',
          address: '江西省南昌市红谷滩新区九龙湖文化艺术中心',
          location: {
            longitude: 115.822459,
            latitude: 28.655229
          },
          visitDuration: 120,
          description: '江西省博物馆是一座大型综合性博物馆，收藏了江西省历史文物、革命文物和民俗文物等。',
          rating: 4.7,
          category: '人文古迹'
        },
        {
          name: '万达广场',
          address: '江西省南昌市红谷滩新区会展路999号',
          location: {
            longitude: 115.859117,
            latitude: 28.691339
          },
          visitDuration: 90,
          description: '南昌万达广场是南昌市最大的购物中心之一，集购物、餐饮、娱乐于一体，是购买当地特产和纪念品的好去处。',
          rating: 4.6,
          category: '购物场所'
        },
        {
          name: '红谷滩中央广场',
          address: '江西省南昌市红谷滩新区丰和中大道与会展路交汇处',
          location: {
            longitude: 115.830731,
            latitude: 28.698734
          },
          visitDuration: 60,
          description: '红谷滩中央广场是南昌市新区的标志性建筑，广场周边有许多现代建筑和商业设施，是拍照和休闲的好地方。',
          rating: 4.5,
          category: '休闲娱乐'
        }
      ],
      meals: [
        {
          type: 'breakfast',
          name: '酒店早餐',
          description: '酒店提供的中式早餐'
        },
        {
          type: 'lunch',
          name: '喜来登中餐厅',
          address: '江西省南昌市红谷滩新区红角洲大道绿地中心',
          description: '提供正宗的粤菜和江西菜，环境优雅'
        },
        {
          type: 'dinner',
          name: '九龙湖畔夜市',
          address: '江西省南昌市红谷滩新区九龙湖附近',
          description: '品尝各种地方小吃，感受南昌的夜生活'
        }
      ]
    }
  ],
  weatherInfo: mockWeatherInfo,
  overallSuggestions: '南昌五月天气较为宜人，但有小雨可能，建议携带雨具。南昌作为江西省会，红色旅游资源丰富，推荐参观八一起义纪念馆等红色景点；同时滕王阁等人文古迹也值得一游。此外，梅岭等自然景点可以欣赏到江西的山水风光。南昌的特色美食有瓦罐汤、米粉和酱板鸭等，不容错过。出行以公共交通为主，景点之间距离适中，建议提前规划路线。根据您的人文偏好，行程中安排了较多的历史文化景点，希望您能充分了解南昌的人文风采。'
}; 