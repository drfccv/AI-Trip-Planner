import { useState, useEffect } from 'react';
import { HashRouter as Router, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { notification, Modal, ConfigProvider } from 'antd';
import './App.css';
import HomePage from './pages/HomePage';
import ResultPage from './pages/ResultPage';
import { generateTripPlan, getWeatherInfo } from './services/api';
import { DeepseekResponse, TripFormData, TripPlan } from './types';
import LoadingPage from './components/LoadingPage';

// 创建一个包装组件，用于处理导航
function AppContent() {
  const [tripPlan, setTripPlan] = useState<TripPlan | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<number>(0);
  const [retryCount, setRetryCount] = useState<number>(0);
  const [shouldRedirect, setShouldRedirect] = useState<boolean>(false);
  const maxRetryCount = 2; // 最大重试次数，应与api.ts中的MAX_RETRY_COUNT一致

  const navigate = useNavigate();

  // 在tripPlan更新或shouldRedirect变化时自动导航到结果页
  useEffect(() => {
    if (tripPlan && shouldRedirect) {
      console.log('导航到结果页面');
      navigate('/result');
      setShouldRedirect(false);
    }
  }, [tripPlan, shouldRedirect, navigate]);

  // 用于显示加载进度的计时器ID
  let progressTimer: number | null = null;

  // 每100ms增加进度条，模拟加载进度
  const startProgressTimer = () => {
    // 清除可能存在的旧计时器
    if (progressTimer) {
      window.clearInterval(progressTimer);
    }
    
    setProgress(0);
    
    // 使用渐变减速的进度增长，在接近100%时放缓速度
    progressTimer = window.setInterval(() => {
      setProgress(prev => {
        if (prev >= 95) {
          // 接近100%时，几乎停止增长，等待实际完成
          return prev + 0.05;
        } else if (prev >= 85) {
          return prev + 0.1;
        } else if (prev >= 70) {
          return prev + 0.3;
        } else if (prev >= 50) {
          return prev + 0.5;
        } else {
          // 初始阶段快速增长
          return prev + 1;
        }
      });
    }, 100);
  };

  // 停止进度计时器
  const stopProgressTimer = () => {
    if (progressTimer) {
      window.clearInterval(progressTimer);
      progressTimer = null;
    }
    
    // 完成时设置为100%
    setProgress(100);
    
    // 短暂延迟后重置进度
    setTimeout(() => {
      setProgress(0);
    }, 500);
  };

  // 处理表单提交
  const handleFormSubmit = async (formData: TripFormData) => {
    setLoading(true);
    setError(null);
    startProgressTimer();
    
    // 增加日志，验证接收到的表单数据中的travelDays
    console.log('接收到的表单数据:', formData);
    console.log('旅行天数:', formData.travelDays);
    
    try {
      // 重置重试计数
      setRetryCount(0);
      
      const response: DeepseekResponse = await generateTripPlan(formData);
      
      // 检查响应中的天数
      console.log('API返回的行程天数:', response.tripPlan?.days?.length);
      
      if (response.result === 'fallback') {
        // 使用了回退数据，显示通知但不阻止继续
        notification.warning({
          message: '使用备用数据',
          description: 
            '由于API请求问题，我们使用了备用数据生成您的旅行计划。如果需要更个性化的计划，请稍后再试。',
          duration: 10,
        });
      } else if (response.result.includes('fallback')) {
        // 解析失败，使用了回退数据
        notification.warning({
          message: 'JSON解析错误',
          description: 
            'API返回的数据格式有问题，我们使用了备用数据生成您的旅行计划。如果需要更个性化的计划，请稍后再试。',
          duration: 10,
        });
      }
      
      if (response.tripPlan) {
        // 获取天气信息
        try {
          const weatherInfo = await getWeatherInfo(formData.city);
          if (weatherInfo && weatherInfo.length > 0) {
            response.tripPlan.weatherInfo = weatherInfo;
          }
        } catch (weatherError) {
          console.error('获取天气信息失败:', weatherError);
          // 天气获取失败不影响主流程
        }
        
        setTripPlan(response.tripPlan);
        // 设置重定向标志
        setShouldRedirect(true);
        console.log('旅行计划已生成，将跳转到结果页面');
      } else {
        throw new Error('无法生成旅行计划');
      }
    } catch (err: any) {
      console.error('生成旅行计划失败:', err);

      // 尝试提取有意义的错误信息
      let errorMessage = '生成旅行计划时发生错误';
      
      if (err.message) {
        errorMessage = err.message;
      }
      
      if (err.code === 'ECONNABORTED') {
        errorMessage = '请求超时，服务器响应时间过长';
        
        // 询问是否要重试
        if (retryCount < maxRetryCount) {
          Modal.confirm({
            title: '请求超时',
            content: '生成旅行计划的请求超时。您想要重试吗？',
            okText: '重试',
            cancelText: '取消',
            onOk: () => {
              setRetryCount(prev => prev + 1);
              handleFormSubmit(formData);
            }
          });
        } else {
          errorMessage = '多次请求超时，请稍后再试或使用更简短的天数/要求';
        }
      } else if (err.response) {
        const status = err.response.status;
        
        if (status === 401 || status === 403) {
          errorMessage = 'API密钥无效或权限不足';
        } else if (status === 429) {
          errorMessage = 'API请求次数超过限制，请稍后再试';
        } else if (status >= 500) {
          errorMessage = '服务器错误，请稍后再试';
        }
      }
      
      // 设置错误信息
      setError(errorMessage);
    } finally {
      stopProgressTimer();
      setLoading(false);
    }
  };

  return (
    <div className="app-container">
      {loading ? (
        <LoadingPage progress={progress} />
      ) : (
        <Routes>
          <Route 
            path="/" 
            element={<HomePage onSubmit={handleFormSubmit} loading={loading} error={error} />} 
          />
          <Route 
            path="/result" 
            element={tripPlan ? (
              <ResultPage 
                tripPlan={tripPlan} 
                onBack={() => {
                  navigate('/');
                  // 可选：清除当前行程计划，以便用户可以重新规划
                  // setTripPlan(null);
                }} 
              />
            ) : <Navigate to="/" />} 
          />
        </Routes>
      )}
    </div>
  );
}

// 主App组件
function App() {
  return (
    <ConfigProvider>
      <Router>
        <AppContent />
      </Router>
    </ConfigProvider>
  );
}

export default App;
