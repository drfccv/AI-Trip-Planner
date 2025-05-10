import React, { useState, useEffect } from 'react';
import { Card, Typography, List, Tag, Descriptions, Button, Row, Col, Badge, Space, Divider, Tabs, Collapse } from 'antd';
import { 
  EnvironmentOutlined, 
  CalendarOutlined, 
  ClockCircleOutlined, 
  InfoCircleOutlined,
  HomeOutlined,
  CarOutlined,
  CoffeeOutlined,
  HistoryOutlined,
  ShoppingOutlined,
  ThunderboltOutlined,
  CloudOutlined,
  ExportOutlined
} from '@ant-design/icons';
import { TripPlan, DayPlan, Attraction, WeatherInfo } from '../types';
import AmapComponent from './AmapComponent';
import { getAttractionPOIInfo } from '../services/api';

const { Title, Text, Paragraph } = Typography;
// 删除未使用的TabPane和Panel声明
const processMealDescription = (description: string): string => {
  if (!description) return '';
  
  // 移除段落中的完全重复内容
  const cleanDescription = (desc: string): string => {
    // 1. 检查完全重复的整个字符串
    const halfLength = Math.floor(desc.length / 2);
    if (desc.substring(0, halfLength) === desc.substring(halfLength) && halfLength > 0) {
      return desc.substring(0, halfLength);
    }
    
    // 2. 按行分割，去除重复的行
    const lines = desc.split('\n').filter(line => line.trim());
    if (lines.length >= 2) {
      const uniqueLines = [...new Set(lines)];
      if (uniqueLines.length < lines.length) {
        return uniqueLines.join('\n');
      }
    }
    
    // 3. 按句号/逗号分割，检查重复的句子
    const sentenceDelimiters = /[.。,，;；]/;
    const sentences = desc.split(sentenceDelimiters).filter(s => s.trim());
    if (sentences.length >= 2) {
      const uniqueSentences = [...new Set(sentences)];
      if (uniqueSentences.length < sentences.length) {
        return uniqueSentences.join('。 ');
      }
    }
    
    // 4. 检查句子内部重复（连续词语重复）
    // 例如："酒店内享用早餐，或在浦东新区的咖啡馆品尝西式早餐。酒店内享用早餐，或在浦东新区的咖啡馆品尝西式早餐。"
    const words = desc.split(/\s+/).filter(w => w.trim());
    const halfWordsLength = Math.floor(words.length / 2);
    let firstHalf = words.slice(0, halfWordsLength).join(' ');
    let secondHalf = words.slice(halfWordsLength).join(' ');
    
    if (firstHalf === secondHalf && firstHalf.length > 0) {
      return firstHalf;
    }
    
    // 5. 检查包含重复的子字符串
    for (let length = Math.floor(desc.length / 2); length >= 10; length--) {
      for (let start = 0; start <= desc.length - length * 2; start++) {
        const substr = desc.substring(start, start + length);
        if (desc.indexOf(substr, start + length) !== -1) {
          // 找到重复子字符串，返回不重复版本
          return desc.replace(new RegExp(substr + '\\s*' + substr, 'g'), substr);
        }
      }
    }
    
    return desc;
  };
  
  return cleanDescription(description);
};

interface TripPlanResultProps {
  tripPlan: TripPlan;
  onBack: () => void;
}

const TripPlanResult: React.FC<TripPlanResultProps> = ({ tripPlan, onBack }) => {
  const [activeTab, setActiveTab] = useState('0');
  const [enhancedTripPlan, setEnhancedTripPlan] = useState<TripPlan>(tripPlan);

  // 使用POI搜索API增强景点信息
  useEffect(() => {
    const enhanceAttractions = async () => {
      console.log('开始增强景点信息...');
      
      const enhancedDays = await Promise.all(
        tripPlan.days.map(async (day) => {
          // 处理每天的景点信息
          const enhancedAttractions = await Promise.all(
            day.attractions.map(async (attraction) => {
              try {
                // 使用高德地图API获取景点的准确信息
                const enhancedInfo = await getAttractionPOIInfo(attraction.name, tripPlan.city);
                console.log(`获取到增强的景点信息: ${attraction.name}`, enhancedInfo);
                
                // 组装地址信息，确保显示高德POI返回的正确地址
                let formattedAddress = enhancedInfo.address;
                if (!formattedAddress || formattedAddress.includes('undefined')) {
                  // 如果地址不存在或包含undefined，使用城市+景点名作为备选地址
                  formattedAddress = `${tripPlan.city}${enhancedInfo.name || attraction.name}`;
                }
                
                // 合并原始信息和增强信息
                return {
                  ...attraction,
                  name: attraction.name,
                  address: formattedAddress,
                  location: enhancedInfo.location,
                  rating: enhancedInfo.rating || attraction.rating,
                  category: enhancedInfo.category || attraction.category
                };
              } catch (error) {
                console.error(`获取景点 ${attraction.name} 信息失败:`, error);
                return attraction; // 如果获取失败，返回原始景点信息
              }
            })
          );
          
          // 返回增强后的日程
          return {
            ...day,
            attractions: enhancedAttractions
          };
        })
      );
      
      // 更新增强后的行程信息
      setEnhancedTripPlan({
        ...tripPlan,
        days: enhancedDays
      });
      
      console.log('景点信息增强完成');
    };
    
    enhanceAttractions();
  }, [tripPlan]);
  
  // 根据不同天气返回不同的图标和颜色
  const getWeatherIcon = (weather: string) => {
    if (weather.includes('晴')) return <ThunderboltOutlined style={{ color: '#faad14' }} />;
    if (weather.includes('雨')) return <CloudOutlined style={{ color: '#1890ff' }} />;
    if (weather.includes('云') || weather.includes('阴')) return <CloudOutlined style={{ color: '#8c8c8c' }} />;
    return <CloudOutlined />;
  };
  
  // 渲染天气信息
  const renderWeatherInfo = (weatherInfo: WeatherInfo[]) => {
    if (!weatherInfo || weatherInfo.length === 0) {
      return <Text>暂无天气信息，请尝试手动查询当地天气预报</Text>;
    }
    
    return (
      <List
        dataSource={weatherInfo}
        renderItem={item => (
          <List.Item>
            <Space size="middle" wrap>
              <Text>{item.date}</Text>
              <Space>
                {getWeatherIcon(item.dayWeather)}
                <Text>白天: {item.dayWeather} {item.dayTemp}°C</Text>
              </Space>
              <Space>
                {getWeatherIcon(item.nightWeather)}
                <Text>夜间: {item.nightWeather} {item.nightTemp}°C</Text>
              </Space>
              <Text>风向: {item.winddirection}</Text>
              <Text>风力: {item.windpower}</Text>
            </Space>
          </List.Item>
        )}
      />
    );
  };
  
  // 渲染单日行程
  const renderDayPlan = (dayPlan: DayPlan) => {
    return (
      <div>
        <Descriptions 
          title={<Title level={4}>{`第${dayPlan.dayIndex + 1}天行程 (${dayPlan.date})`}</Title>}
          bordered
          column={{ xxl: 4, xl: 3, lg: 3, md: 2, sm: 1, xs: 1 }}
          layout="vertical"
          size="small"
        >
          <Descriptions.Item label="交通方式">
            <Space>
              <CarOutlined />
              <Text>{dayPlan.transportation}</Text>
            </Space>
          </Descriptions.Item>
          <Descriptions.Item label="住宿">
            <Space>
              <HomeOutlined />
              <Text>{dayPlan.accommodation}</Text>
            </Space>
          </Descriptions.Item>
        </Descriptions>
        
        <Paragraph style={{ margin: '16px 0' }}>
          {dayPlan.description}
        </Paragraph>
        
        <Divider>
          <Title level={5} style={{ margin: 0, textAlign: 'center' }}>景点安排</Title>
        </Divider>
        
        <List
          itemLayout="vertical"
          dataSource={dayPlan.attractions}
          renderItem={(attraction, index) => (
            <Badge.Ribbon 
              text={`景点 ${index + 1}`} 
              color={index % 2 === 0 ? 'blue' : 'cyan'}
            >
              <Card 
                style={{ marginBottom: 16 }}
                hoverable
                size="small"
              >
                <List.Item>
                  <List.Item.Meta
                    title={
                      <Space wrap>
                        <EnvironmentOutlined />
                        <Text strong>{attraction.name}</Text>
                        {attraction.rating && (
                          <Tag color="orange">
                            <span style={{ fontSize: '14px' }}>★ {attraction.rating} 分</span>
                          </Tag>
                        )}
                        {attraction.category && (
                          <Tag color="green">{attraction.category}</Tag>
                        )}
                      </Space>
                    }
                    description={
                      <>
                        <Paragraph>
                          <Text type="secondary">
                            <ClockCircleOutlined /> 游览时间: 约 {(attraction.visitDuration / 60).toFixed(1)} 小时
                          </Text>
                        </Paragraph>
                        <Paragraph>
                          <Text type="secondary">
                            <EnvironmentOutlined /> 地址: {attraction.address}
                          </Text>
                        </Paragraph>
                      </>
                    }
                  />
                  <Paragraph>{attraction.description}</Paragraph>
                </List.Item>
              </Card>
            </Badge.Ribbon>
          )}
        />
        
        <Divider>
          <Title level={5} style={{ margin: 0, textAlign: 'center' }}>用餐安排</Title>
        </Divider>
        
        <List
          grid={{ gutter: 16, xs: 1, sm: 3, md: 3, lg: 3 }}
          dataSource={dayPlan.meals}
          renderItem={meal => (
            <List.Item>
              <Card 
                title={
                  <Space>
                    <CoffeeOutlined />
                    <Text>{meal.type === 'breakfast' ? '早餐' : meal.type === 'lunch' ? '午餐' : meal.type === 'dinner' ? '晚餐' : '小吃'}</Text>
                  </Space>
                }
                size="small"
                style={{ height: '100%', display: 'flex', flexDirection: 'column' }}
                styles={{ body: { flex: '1 1 auto' } }}
              >
                <Paragraph><Text strong>{meal.name}</Text></Paragraph>
                {meal.address && (
                  <Paragraph>
                    <Text type="secondary">
                      <EnvironmentOutlined /> {meal.address}
                    </Text>
                  </Paragraph>
                )}
                {meal.description && <Paragraph>{processMealDescription(meal.description)}</Paragraph>}
              </Card>
            </List.Item>
          )}
        />
      </div>
    );
  };
  
  // 当前显示的景点，用于地图显示
  const getCurrentAttractions = (): Attraction[] => {
    if (activeTab === '0') {
      // 概览模式，显示所有景点
      return enhancedTripPlan.days.flatMap(day => day.attractions);
    } else {
      // 单日模式，只显示当天景点
      const dayIndex = parseInt(activeTab, 10) - 1;
      return enhancedTripPlan.days[dayIndex]?.attractions || [];
    }
  };
  
  // 为Collapse组件构建items
  const collapseItems = enhancedTripPlan.days.map((day, index) => ({
    key: String(index),
    label: `第${index + 1}天 - ${day.date}`,
    children: (
      <>
        <Paragraph>{day.description}</Paragraph>
        <List
          size="small"
          dataSource={day.attractions}
          renderItem={(attraction, i) => (
            <List.Item>
              <Text>{i + 1}. {attraction.name}</Text>
            </List.Item>
          )}
        />
      </>
    )
  }));

  const generateTravelAdvice = (tripPlan: TripPlan): React.ReactNode => {
    const hasRainyDays = tripPlan.weatherInfo?.some(w => 
      w.dayWeather.includes('雨') || w.nightWeather.includes('雨')
    );
    
    const hasHighTemps = tripPlan.weatherInfo?.some(w => w.dayTemp >= 30);
    const hasLowTemps = tripPlan.weatherInfo?.some(w => w.nightTemp <= 10);
    
    const hasOutdoorAttractions = tripPlan.days.some(day => 
      day.attractions.some(attr => 
        attr.category?.includes('自然') || 
        attr.category?.includes('公园') || 
        attr.category?.includes('风景') ||
        attr.description?.includes('自然') ||
        attr.description?.includes('户外') ||
        attr.description?.includes('公园') ||
        attr.description?.includes('山') ||
        attr.description?.includes('湖')
      )
    );
    
    const hasHistoricalSites = tripPlan.days.some(day => 
      day.attractions.some(attr => 
        attr.category?.includes('历史') || 
        attr.category?.includes('文化') || 
        attr.category?.includes('博物馆') ||
        attr.description?.includes('历史') ||
        attr.description?.includes('文化') ||
        attr.description?.includes('博物馆') ||
        attr.description?.includes('古') ||
        attr.description?.includes('遗址')
      )
    );
    
    const hasDenseSchedule = tripPlan.days.some(day => 
      day.attractions.length >= 4 || 
      day.attractions.reduce((total, attr) => total + (attr.visitDuration || 0), 0) > 480
    );
    
    return (
      <>
        <Paragraph>{tripPlan.overallSuggestions}</Paragraph>
        
        <Divider orientation="left">个性化建议</Divider>
        
        <List
          size="small"
          itemLayout="horizontal"
          dataSource={[
            // 天气相关建议
            ...(hasRainyDays ? [{
              icon: <CloudOutlined style={{ color: '#1890ff' }} />,
              title: '雨具准备',
              description: '旅行期间可能遇到降雨天气，建议携带雨伞或雨衣，选择防水鞋履。'
            }] : []),
            ...(hasHighTemps ? [{
              icon: <ThunderboltOutlined style={{ color: '#faad14' }} />,
              title: '防暑降温',
              description: '部分日期气温较高，请携带防晒霜、太阳镜和遮阳帽，保持水分摄入，避免中午高温时段户外活动。'
            }] : []),
            ...(hasLowTemps ? [{
              icon: <CloudOutlined style={{ color: '#8c8c8c' }} />,
              title: '保暖提示',
              description: '夜间温度可能较低，建议携带保暖外套，尤其是早晚出行时。'
            }] : []),
            
            // 景点类型相关建议
            ...(hasOutdoorAttractions ? [{
              icon: <EnvironmentOutlined style={{ color: '#52c41a' }} />,
              title: '户外活动准备',
              description: '行程包含自然景观和户外活动，建议穿着舒适的运动鞋，携带防蚊虫喷雾、便携式药品等。'
            }] : []),
            ...(hasHistoricalSites ? [{
              icon: <HistoryOutlined style={{ color: '#722ed1' }} />,
              title: '文化景点参观',
              description: '行程包含历史文化景点，建议提前了解相关历史背景，注意遵守参观规定，携带相机记录精彩瞬间。'
            }] : []),
            
            // 行程密度相关建议
            ...(hasDenseSchedule ? [{
              icon: <ClockCircleOutlined style={{ color: '#f5222d' }} />,
              title: '行程紧凑提醒',
              description: '部分日期行程较为紧凑，建议提前规划路线，预留缓冲时间，避免过度疲劳。'
            }] : []),
            
            // 通用建议
            {
              icon: <InfoCircleOutlined style={{ color: '#1890ff' }} />,
              title: '出行准备',
              description: `请随身携带身份证件和必要的证件，提前预订热门景点门票，下载${tripPlan.city}离线地图，记录紧急联系人信息。`
            },
            {
              icon: <ShoppingOutlined style={{ color: '#eb2f96' }} />,
              title: '特色购物',
              description: `可以考虑购买${tripPlan.city}特色产品作为纪念，如当地手工艺品、特色食品等。`
            },
            {
              icon: <CarOutlined style={{ color: '#faad14' }} />,
              title: '交通建议',
              description: `建议熟悉${tripPlan.city}的交通规则和公共交通系统，提前规划每日行程路线，预留足够时间应对交通延误。`
            }
          ]}
          renderItem={item => (
            <List.Item>
              <List.Item.Meta
                avatar={item.icon}
                title={item.title}
                description={item.description}
              />
            </List.Item>
          )}
        />
      </>
    );
  };
  
  return (
    <div className="trip-plan-result">
      <Row gutter={[{ xs: 8, sm: 16, md: 24 }, { xs: 8, sm: 16, md: 24 }]}>
        <Col span={24}>
          <Card variant="borderless" size="small">
            <Button type="primary" onClick={onBack} icon={<ExportOutlined />} style={{ marginBottom: 16 }}>
              返回重新规划
            </Button>
            
            <Title level={2} style={{ textAlign: 'center' }}>
              {enhancedTripPlan.city}旅行计划
            </Title>
            
            <div style={{ textAlign: 'center', margin: '16px 0' }}>
              <Space split={<Divider type="vertical" />} wrap>
                <Text>
                  <CalendarOutlined /> {enhancedTripPlan.startDate} 至 {enhancedTripPlan.endDate}
                </Text>
                <Text>
                  <HistoryOutlined /> 共 {enhancedTripPlan.days.length} 天
                </Text>
              </Space>
            </div>
          </Card>
        </Col>
        
        <Col span={24}>
          <Card 
            title={
              <Space>
                <CloudOutlined />
                <Text>天气信息</Text>
              </Space>
            } 
            variant="borderless"
            size="small"
          >
            {renderWeatherInfo(enhancedTripPlan.weatherInfo)}
          </Card>
        </Col>
        
        <Col span={24} lg={12}>
          <Card 
            title={
              <Space>
                <InfoCircleOutlined />
                <Text>总体建议</Text>
              </Space>
            } 
            variant="borderless"
            size="small"
          >
            {generateTravelAdvice(enhancedTripPlan)}
          </Card>
        </Col>
        
        <Col span={24} lg={12}>
          <Card 
            title={
              <Space>
                <EnvironmentOutlined />
                <Text>旅行地图</Text>
              </Space>
            } 
            variant="borderless"
            size="small"
            styles={{ body: { height: '350px' } }}
          >
            <AmapComponent 
              attractions={getCurrentAttractions()}
              city={enhancedTripPlan.city}
              showRoute={true}
            />
          </Card>
        </Col>
        
        <Col span={24}>
          <Card variant="borderless" size="small">
            <Tabs 
              defaultActiveKey="0" 
              onChange={setActiveTab}
              type="card"
              tabPosition="top"
              size="small"
              items={[
                {
                  key: '0',
                  label: '行程概览',
                  children: (
                    <Collapse 
                      defaultActiveKey={['0']} 
                      accordion
                      size="small"
                      items={collapseItems}
                    />
                  )
                },
                ...enhancedTripPlan.days.map((day, index) => ({
                  key: String(index + 1),
                  label: `第${index + 1}天`,
                  children: renderDayPlan(day)
                }))
              ]}
            />
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default TripPlanResult;