import React, { useState } from 'react';
import { Form, Input, Button, DatePicker, Select, Tag, Card, Typography } from 'antd';
import { PlusOutlined, EnvironmentOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { TripFormData } from '../types';

const { Title, Paragraph } = Typography;
const { RangePicker } = DatePicker;
const { TextArea } = Input;

interface TripInputFormProps {
  onSubmit: (formData: TripFormData) => void;
  loading?: boolean;
}

const TripInputForm: React.FC<TripInputFormProps> = ({ onSubmit, loading = false }) => {
  const [form] = Form.useForm();
  const [preferences, setPreferences] = useState<string[]>([]);
  const [inputVisible, setInputVisible] = useState(false);
  const [inputValue, setInputValue] = useState('');
  
  // 预设的偏好选项
  const presetPreferences = [
    '自然风光', '历史文化', '美食', '购物', '摄影', '博物馆', '艺术', '户外活动', 
    '古建筑', '宗教', '民俗', '现代都市', '家庭游', '浪漫', '冒险'
  ];

  // 交通方式选项
  const transportationOptions = [
    { value: '公共交通', label: '公共交通（地铁、公交等）' },
    { value: '自驾', label: '自驾' },
    { value: '步行', label: '步行为主' },
    { value: '出租车', label: '出租车/网约车' },
    { value: '骑行', label: '骑行' },
    { value: '混合', label: '混合交通方式' }
  ];

  // 住宿选项
  const accommodationOptions = [
    { value: '经济型酒店', label: '经济型酒店' },
    { value: '中高端酒店', label: '中高端酒店' },
    { value: '豪华酒店', label: '豪华酒店' },
    { value: '民宿/客栈', label: '民宿/客栈' },
    { value: '青年旅舍', label: '青年旅舍' },
    { value: '公寓', label: '短租公寓' }
  ];

  // 处理提交
  const handleSubmit = (values: any) => {
    const dateRange = values.dateRange;
    const startDate = dateRange[0].format('YYYY-MM-DD');
    const endDate = dateRange[1].format('YYYY-MM-DD');
    
    // 计算天数
    const travelDays = dateRange[1].diff(dateRange[0], 'day') + 1;
    
    // 添加日志，验证travelDays的计算结果
    console.log('计算得到的旅行天数:', travelDays);
    console.log('开始日期:', startDate, '结束日期:', endDate);
    
    const formData: TripFormData = {
      city: values.city,
      startDate,
      endDate,
      travelDays,
      transportation: values.transportation,
      accommodation: values.accommodation,
      preferences: preferences,
      freeTextInput: values.freeTextInput || ''
    };
    
    // 验证formData中的travelDays
    console.log('提交的formData:', formData);
    
    onSubmit(formData);
  };

  // 添加自定义偏好标签
  const addPreference = () => {
    if (inputValue && !preferences.includes(inputValue)) {
      setPreferences([...preferences, inputValue]);
    }
    setInputValue('');
    setInputVisible(false);
  };

  // 移除偏好标签
  const removePreference = (preference: string) => {
    setPreferences(preferences.filter(p => p !== preference));
  };

  // 切换预设偏好
  const togglePreference = (preference: string) => {
    if (preferences.includes(preference)) {
      removePreference(preference);
    } else {
      setPreferences([...preferences, preference]);
    }
  };

  return (
    <Card variant="borderless" className="trip-input-form-card">
      <Title level={2} style={{ textAlign: 'center', marginBottom: 30 }}>智能旅行规划助手</Title>
      <Paragraph style={{ textAlign: 'center', marginBottom: 30 }}>
        输入您的旅行偏好，我们将为您规划最优旅行路线
      </Paragraph>
      
      <Form
        form={form}
        layout="vertical"
        onFinish={handleSubmit}
        initialValues={{
          transportation: '公共交通',
          accommodation: '经济型酒店'
        }}
      >
        <Form.Item
          name="city"
          label="旅行城市"
          rules={[{ required: true, message: '请输入您要去的城市' }]}
        >
          <Input 
            placeholder="例如：北京、上海、成都..." 
            size="large" 
            prefix={<EnvironmentOutlined />} 
          />
        </Form.Item>
        
        <Form.Item
          name="dateRange"
          label="旅行日期"
          rules={[{ type: 'array', required: true, message: '请选择旅行日期' }]}
        >
          <RangePicker
            size="large"
            style={{ width: '100%' }}
            disabledDate={(current) => current && current < dayjs().startOf('day')}
            format="YYYY-MM-DD"
            placeholder={['开始日期', '结束日期']}
          />
        </Form.Item>
        
        <Form.Item
          name="transportation"
          label="出行方式"
        >
          <Select
            size="large"
            placeholder="选择主要出行方式"
            options={transportationOptions}
          />
        </Form.Item>
        
        <Form.Item
          name="accommodation"
          label="住宿选择"
        >
          <Select
            size="large"
            placeholder="选择住宿类型"
            options={accommodationOptions}
          />
        </Form.Item>
        
        <Form.Item label="旅游偏好">
          <div style={{ marginBottom: 16 }}>
            {presetPreferences.map(preference => (
              <Tag
                key={preference}
                color={preferences.includes(preference) ? '#1890ff' : undefined}
                style={{ 
                  cursor: 'pointer', 
                  margin: '0 8px 8px 0',
                  padding: '5px 10px'
                }}
                onClick={() => togglePreference(preference)}
              >
                {preference}
              </Tag>
            ))}
          </div>
          
          <div>
            {preferences
              .filter(p => !presetPreferences.includes(p))
              .map(preference => (
                <Tag
                  key={preference}
                  closable
                  style={{ margin: '0 8px 8px 0', padding: '5px 10px' }}
                  onClose={() => removePreference(preference)}
                >
                  {preference}
                </Tag>
              ))
            }
            
            {inputVisible ? (
              <Input
                type="text"
                size="small"
                style={{ width: 100 }}
                value={inputValue}
                onChange={e => setInputValue(e.target.value)}
                onBlur={addPreference}
                onPressEnter={addPreference}
                autoFocus
              />
            ) : (
              <Tag 
                onClick={() => setInputVisible(true)}
                style={{ 
                  background: '#fff', 
                  borderStyle: 'dashed',
                  cursor: 'pointer',
                  padding: '5px 10px'
                }}
              >
                <PlusOutlined /> 添加偏好
              </Tag>
            )}
          </div>
        </Form.Item>
        
        <Form.Item
          name="freeTextInput"
          label="其他需求 (可选)"
        >
          <TextArea
            placeholder="例如：我五一打算去南昌市玩三天，想多了解了解人文..."
            rows={4}
            showCount
            maxLength={500}
          />
        </Form.Item>
        
        <Form.Item>
          <Button 
            type="primary" 
            htmlType="submit" 
            size="large" 
            block
            loading={loading}
          >
            生成旅行规划
          </Button>
        </Form.Item>
      </Form>
    </Card>
  );
};

export default TripInputForm;