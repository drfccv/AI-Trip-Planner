import React, { useEffect, useState } from 'react';
import { Spin, Progress, Typography, Card, Space, Row, Col, Steps } from 'antd';
import { LoadingOutlined, CloudOutlined, RocketOutlined, CompassOutlined, CheckCircleOutlined } from '@ant-design/icons';
import '../App.css';

const { Title, Text, Paragraph } = Typography;

interface LoadingPageProps {
  progress: number;
}

const loadingMessages = [
  "正在探索景点信息...",
  "正在规划最佳路线...",
  "正在查询当地美食推荐...",
  "正在生成详细行程...",
  "正在优化您的旅行体验...",
  "正在考虑景点之间的距离...",
  "正在为您精选当地特色景点...",
  "正在计算景点游览时间...",
  "正在添加旅行建议...",
  "马上就好，旅行计划即将完成..."
];

// 定义加载过程中展示的旅行小贴士
const travelTips = [
  "出行提示: 旅行前检查天气预报，合理准备衣物",
  "出行提示: 随身携带常用药品，以备不时之需",
  "出行提示: 保持手机电量充足，及时与家人朋友分享行程",
  "出行提示: 提前了解目的地的当地习俗和禁忌",
  "出行提示: 保存重要文件电子版，如身份证、保险单等",
  "出行提示: 预留足够的休息时间，避免行程过于紧凑",
  "出行提示: 重要景点提前网上预约，避免排队等待"
];

// 定义加载阶段步骤
const loadingSteps = [
  {
    title: '开始规划',
    description: '收集旅行数据',
  },
  {
    title: '景点查询',
    description: '筛选最佳景点',
  },
  {
    title: '路线规划',
    description: '优化行程路线',
  },
  {
    title: '生成计划',
    description: '定制专属行程',
  },
  {
    title: '完成',
    description: '整理最终方案',
  }
];

const LoadingPage: React.FC<LoadingPageProps> = ({ progress }) => {
  // 根据进度选择显示的消息
  const getMessageIndex = (progress: number) => {
    if (progress < 10) return 0;
    if (progress < 20) return 1;
    if (progress < 30) return 2;
    if (progress < 40) return 3;
    if (progress < 50) return 4;
    if (progress < 60) return 5;
    if (progress < 70) return 6;
    if (progress < 80) return 7;
    if (progress < 90) return 8;
    return 9;
  };
  
  // 计算当前步骤
  const getCurrentStep = (progress: number) => {
    if (progress < 20) return 0;
    if (progress < 40) return 1;
    if (progress < 60) return 2;
    if (progress < 80) return 3;
    return 4;
  };
  
  const messageIndex = getMessageIndex(progress);
  const currentStep = getCurrentStep(progress);
  
  // 随机选择一个旅行小贴士
  const [tip, setTip] = useState(travelTips[0]);
  
  // 每8秒更换一次旅行小贴士
  useEffect(() => {
    const interval = setInterval(() => {
      const randomIndex = Math.floor(Math.random() * travelTips.length);
      setTip(travelTips[randomIndex]);
    }, 8000);
    
    return () => clearInterval(interval);
  }, []);
  
  // 动画图标
  const getIcon = () => {
    if (progress < 30) return <CloudOutlined style={{ fontSize: 36, color: '#1890ff' }} />;
    if (progress < 70) return <CompassOutlined style={{ fontSize: 36, color: '#52c41a' }} />;
    return <RocketOutlined style={{ fontSize: 36, color: '#722ed1' }} />;
  };
  
  return (
    <div className="loading-container" style={{ 
      display: 'flex', 
      justifyContent: 'center', 
      alignItems: 'center', 
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%)',
      padding: '20px'
    }}>
      <Card 
        style={{ 
          width: '90%', 
          maxWidth: 700, 
          borderRadius: '15px',
          boxShadow: '0 10px 25px rgba(0,0,0,0.1)',
          overflow: 'hidden'
        }}
        styles={{ 
          body: { padding: '30px' } 
        }}
      >
        <div style={{ textAlign: 'center' }}>
          <Space direction="vertical" size="large" style={{ width: '100%' }}>
            <div>
              <Title level={2} style={{ 
                marginBottom: 10, 
                background: 'linear-gradient(90deg, #1890ff, #722ed1)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent'
              }}>
                旅行计划生成中
              </Title>
              <Paragraph type="secondary">
                AI正在为您精心设计完美旅程，请稍候...
              </Paragraph>
            </div>

            <Row gutter={[16, 16]} align="middle">
              <Col xs={24} md={8} style={{ textAlign: 'center' }}>
                <div style={{ margin: '20px 0' }}>
                  <Spin indicator={
                    <LoadingOutlined style={{ fontSize: 48, color: progress > 50 ? '#52c41a' : '#1890ff' }} spin />
                  } />
                  <div style={{ marginTop: 15 }}>
                    {getIcon()}
                  </div>

                  <Progress 
                    type="circle"
                    percent={Math.round(progress)} 
                    status={progress < 100 ? "active" : "success"} 
                    strokeColor={{
                      '0%': '#108ee9',
                      '50%': '#52c41a',
                      '100%': '#722ed1',
                    }}
                    size={120}
                    style={{ marginTop: 20 }}
                  />
                </div>
              </Col>
              
              <Col xs={24} md={16}>
                <div style={{ padding: '0 10px', marginBottom: 20 }}>
                  <Steps
                    direction="vertical"
                    size="small"
                    current={currentStep}
                    items={loadingSteps.map((step, index) => ({
                      title: step.title,
                      description: step.description,
                      status: index < currentStep ? 'finish' : index === currentStep ? 'process' : 'wait',
                      icon: index < currentStep ? <CheckCircleOutlined /> : undefined
                    }))}
                  />
                </div>
              </Col>
            </Row>
            
            <div style={{ width: '100%', padding: '0 10px', marginBottom: 15 }}>
              <Progress 
                percent={Math.round(progress)} 
                status={progress < 100 ? "active" : "success"} 
                strokeColor={{
                  '0%': '#108ee9',
                  '50%': '#52c41a',
                  '100%': '#722ed1',
                }}
                size={[12, 6]}
                format={percent => `${percent}%`}
              />
            </div>
            
            <div style={{ 
              background: progress > 70 ? 'rgba(82, 196, 26, 0.1)' : 'rgba(24, 144, 255, 0.1)', 
              padding: '15px', 
              borderRadius: '8px',
              transition: 'background 0.3s',
              animation: 'pulse 2s infinite ease-in-out'
            }}>
              <Text strong style={{ fontSize: 16, color: progress > 70 ? '#389e0d' : '#096dd9' }}>
                {loadingMessages[messageIndex]}
              </Text>
            </div>
            
            <Card size="small" style={{ 
              marginTop: 15,
              background: 'rgba(0, 0, 0, 0.02)', 
              border: '1px dashed #d9d9d9'
            }}>
              <Paragraph style={{ margin: 0 }}>{tip}</Paragraph>
            </Card>
            
            {progress > 80 && (
              <div style={{ 
                marginTop: 10, 
                animation: 'fadeIn 1s ease-in-out',
                background: 'rgba(255, 234, 167, 0.3)',
                padding: '10px',
                borderRadius: '8px'
              }}>
                <Text type="warning" style={{ fontSize: 14 }}>
                  最后冲刺中，即将为您呈现精彩旅程...
                </Text>
              </div>
            )}
          </Space>
        </div>
      </Card>

      <style>{`
        @keyframes pulse {
          0% { transform: scale(1); }
          50% { transform: scale(1.02); }
          100% { transform: scale(1); }
        }
        
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
      `}</style>
    </div>
  );
};

export default LoadingPage;