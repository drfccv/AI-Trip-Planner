import React, { useEffect, useRef, useState } from 'react';
import { Spin, Typography } from 'antd';
import { LoadingOutlined } from '@ant-design/icons';
import { ENV } from '../env';
import { Attraction } from '../types';

const { Text } = Typography;

// 高德地图加载AMap
declare global {
  interface Window {
    AMap: any;
    _AMapSecurityConfig: {
      securityJsCode: string;
    };
  }
}

interface AmapComponentProps {
  attractions?: Attraction[];
  city: string;
  showRoute?: boolean;
}

const AmapComponent: React.FC<AmapComponentProps> = ({ 
  attractions = [], 
  city,
  showRoute = true 
}) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [mapInstance, setMapInstance] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [markers, setMarkers] = useState<any[]>([]);
  const [driving, setDriving] = useState<any>(null);

  // 加载高德地图脚本
  useEffect(() => {
    // 设置安全密钥
    window._AMapSecurityConfig = {
      securityJsCode: ENV.AMAP_SECURITY_KEY
    };

    // 如果已经加载了AMap，则不再重复加载
    if (window.AMap) {
      initMap();
      return;
    }

    const script = document.createElement('script');
    script.src = `https://webapi.amap.com/maps?v=2.0&key=${ENV.AMAP_API_KEY}&plugin=AMap.Scale,AMap.ToolBar,AMap.Driving,AMap.Walking,AMap.Weather,AMap.Marker,AMap.Polyline`;
    script.async = true;
    script.onload = () => {
      initMap();
    };
    script.onerror = () => {
      setError('高德地图加载失败');
      setLoading(false);
    };
    document.head.appendChild(script);

    return () => {
      if (mapInstance) {
        mapInstance.destroy();
      }
    };
  }, []);

  // 地图初始化
  const initMap = () => {
    if (!mapRef.current) return;
    
    try {
      const map = new window.AMap.Map(mapRef.current, {
        zoom: 12,
        resizeEnable: true,
        viewMode: '3D'
      });
      
      // 添加控件
      map.addControl(new window.AMap.Scale());
      map.addControl(new window.AMap.ToolBar());
      
      // 初始化驾车路径规划
      const drivingInstance = new window.AMap.Driving({
        map: map,
        policy: window.AMap.DrivingPolicy.LEAST_TIME,
        hideMarkers: true,
        showTraffic: true,
        autoFitView: true
      });
      
      // 保存地图实例和驾车实例
      setMapInstance(map);
      setDriving(drivingInstance);
      setLoading(false);

      // 城市搜索定位
      if (city) {
        map.setCity(city);
      }
    } catch (err) {
      console.error('地图初始化错误:', err);
      setError('地图初始化失败');
      setLoading(false);
    }
  };

  // 清除所有标记和路线
  const clearMapOverlays = () => {
    if (!mapInstance) return;
    
    // 清除地图标记
    if (markers.length > 0) {
      mapInstance.remove(markers);
      setMarkers([]);
    }
    
    // 清除驾车路线
    if (driving) {
      driving.clear();
    }
  };

  // 当景点数据变化时，更新地图标记和路线
  useEffect(() => {
    if (!mapInstance || !driving || attractions.length === 0) return;

    // 调试: 输出接收到的景点位置信息
    console.log('AmapComponent 接收到的景点信息:', JSON.stringify(attractions, null, 2));
    
    // 清除已有的覆盖物
    clearMapOverlays();
    
    // 添加景点标记
    const newMarkers: any[] = [];
    const positions: any[] = [];
    
    attractions.forEach((attraction, index) => {
      const { latitude, longitude } = attraction.location;
      
      // 调试: 输出每个景点的位置信息
      console.log(`景点 ${index + 1}. ${attraction.name} 位置:`, { latitude, longitude });
      
      const position = [longitude, latitude];
      positions.push(position);
      
      // 创建标记
      const marker = new window.AMap.Marker({
        position,
        title: attraction.name,
        label: {
          content: `<div style="padding: 5px; background-color: #fff; border-radius: 3px; box-shadow: 0 2px 6px 0 rgba(0, 0, 0, .3);">
                      <span style="font-weight: bold;">${index + 1}. ${attraction.name}</span>
                    </div>`,
          direction: 'top'
        }
      });
      
      // 添加点击事件
      marker.on('click', () => {
        const infoWindow = new window.AMap.InfoWindow({
          content: `<div style="max-width: 280px;">
                      <h3>${attraction.name}</h3>
                      <p>${attraction.rating ? `<span style="color:#ff9800;">★ ${attraction.rating}分</span>` : ''}</p>
                      <p>地址: ${attraction.address}</p>
                      <p>建议游玩时长: ${(attraction.visitDuration / 60).toFixed(1)}小时</p>
                      <p>${attraction.description}</p>
                    </div>`,
          offset: new window.AMap.Pixel(0, -30)
        });
        
        infoWindow.open(mapInstance, marker.getPosition());
      });
      
      newMarkers.push(marker);
    });
    
    // 将所有标记添加到地图并保存引用
    mapInstance.add(newMarkers);
    setMarkers(newMarkers);
    
    // 调整视野以包含所有标记
    if (positions.length > 0) {
      mapInstance.setFitView(newMarkers);
    }
    
    // 如果需要显示路线并且有多个景点，则绘制路线
    if (showRoute && positions.length > 1) {
      drawRoute(positions);
    }
  }, [mapInstance, driving, attractions, showRoute]);

  // 绘制路线 - 优化版本
  const drawRoute = (positions: any[]) => {
    if (!mapInstance || !driving || positions.length < 2) return;
    
    // 清除之前的路线
    driving.clear();
    
    // 构建途经点
    const waypoints = positions.slice(1, -1);
    const origin = positions[0];
    const destination = positions[positions.length - 1];
    
    try {
      // 规划路线
      driving.search(
        origin,
        destination,
        { waypoints },
        (status: string, result: any) => {
          if (status === 'complete') {
            console.log('绘制路线成功');
            // 设置地图视野以包含所有路线和标记
            mapInstance.setFitView();
          } else {
            console.error('路线规划失败:', result);
            // 当路线规划失败时，尝试使用简单折线连接各点
            drawFallbackRoute(positions);
          }
        }
      );
    } catch (error) {
      console.error('路线规划出错:', error);
      // 捕获到错误时，使用备用方法连接点
      drawFallbackRoute(positions);
    }
  };
  
  // 备用路线绘制方法 - 当驾车路线规划失败时使用
  const drawFallbackRoute = (positions: any[]) => {
    if (!mapInstance) return;
    
    try {
      // 创建折线
      const polyline = new window.AMap.Polyline({
        path: positions,
        isOutline: true,
        outlineColor: '#ffeeff',
        borderWeight: 2,
        strokeColor: '#3366FF', 
        strokeOpacity: 0.7,
        strokeWeight: 6,
        strokeStyle: 'solid',
        strokeDasharray: [10, 5],
        lineJoin: 'round',
        lineCap: 'round',
        zIndex: 50,
      });
      
      // 添加到地图
      mapInstance.add(polyline);
      
      // 保存到markers数组以便后续清除
      setMarkers(prev => [...prev, polyline]);
      
      // 设置地图视野以包含所有标记和线条
      mapInstance.setFitView();
    } catch (error) {
      console.error('备用路线绘制失败:', error);
    }
  };

  return (
    <div style={{ height: '100%', width: '100%', position: 'relative' }}>
      {loading && (
        <div style={{ 
          position: 'absolute', 
          top: '50%', 
          left: '50%', 
          transform: 'translate(-50%, -50%)',
          backgroundColor: 'rgba(255, 255, 255, 0.7)',
          padding: '20px',
          borderRadius: '4px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center'
        }}>
          <Spin indicator={<LoadingOutlined style={{ fontSize: 40 }} spin />} />
          <Text style={{ marginTop: '10px' }}>地图加载中...</Text>
        </div>
      )}
      {error && (
        <div style={{ 
          position: 'absolute', 
          top: '50%', 
          left: '50%', 
          transform: 'translate(-50%, -50%)',
          backgroundColor: 'rgba(255, 255, 255, 0.7)',
          padding: '20px',
          borderRadius: '4px',
          color: 'red'
        }}>
          {error}
        </div>
      )}
      <div 
        ref={mapRef} 
        style={{ 
          height: '100%', 
          width: '100%',
          borderRadius: '8px',
          overflow: 'hidden'
        }}
      />
    </div>
  );
};

export default AmapComponent;