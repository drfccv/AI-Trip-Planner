import React from 'react';
import { Layout, Row, Col, Image } from 'antd';
import TripInputForm from '../components/TripInputForm';
import { TripFormData } from '../types';

const { Content, Footer } = Layout;

interface HomePageProps {
  onSubmit: (formData: TripFormData) => Promise<void>;
  loading: boolean;
  error: string | null;
}

const HomePage: React.FC<HomePageProps> = ({ onSubmit, loading = false }) => {
  return (
    <Layout style={{ minHeight: '100vh', width: '100%', maxWidth: '100vw', overflow: 'hidden' }}>
      <Content style={{ 
        padding: '20px 0', 
        background: 'linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%)'
      }}>
        <Row justify="center" align="middle" style={{ width: '100%' }}>
          <Col xs={23} sm={22} md={18} lg={16} xl={14} xxl={12}>
            <div style={{ textAlign: 'center', marginBottom: '20px' }}>
              <Image 
                src="https://img.icons8.com/fluency/96/null/around-the-globe.png"
                alt="旅行计划"
                preview={false}
                style={{ width: 80, height: 80 }}
              />
            </div>
            <TripInputForm onSubmit={onSubmit} loading={loading} />
          </Col>
        </Row>
      </Content>
      <Footer style={{ textAlign: 'center', background: '#f0f2f5', padding: '12px' }}>
        旅行规划助手 ©{new Date().getFullYear()} 基于高德地图与硅基流动API
      </Footer>
    </Layout>
  );
};

export default HomePage;