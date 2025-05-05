import React from 'react';
import { Layout } from 'antd';
import TripPlanResult from '../components/TripPlanResult';
import { TripPlan } from '../types';

const { Content, Footer } = Layout;

interface ResultPageProps {
  tripPlan: TripPlan;
  onBack: () => void;
}

const ResultPage: React.FC<ResultPageProps> = ({ tripPlan, onBack }) => {
  return (
    <Layout style={{ minHeight: '100vh', width: '100%', maxWidth: '100vw', overflow: 'hidden' }}>
      <Content style={{ 
        padding: '16px', 
        background: '#f0f2f5',
        width: '100%'
      }}>
        <TripPlanResult tripPlan={tripPlan} onBack={onBack} />
      </Content>
      <Footer style={{ textAlign: 'center', background: '#f0f2f5', padding: '12px' }}>
        旅行规划助手 ©{new Date().getFullYear()} 基于高德地图与硅基流动API
      </Footer>
    </Layout>
  );
};

export default ResultPage; 