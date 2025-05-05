# AI 旅行规划助手 🌍✈️

![项目Logo](./public/travel-icon.svg)

一个基于人工智能的旅行规划助手，利用大语言模型和高德地图API为用户定制个性化的旅行计划。

📝 **[在线体验 Demo](https://drfccv.github.io/AI-Trip-Planner/)**

## ✨ 功能特点

- 🤖 **AI驱动的旅行规划**：基于硅基流动Qwen/Qwen3-235B-A22B模型智能生成详细的多日旅程
- 🗺️ **高德地图集成**：准确显示景点位置和路线规划
- 🌦️ **实时天气信息**：获取目的地的准确天气预报
- 🏨 **完整旅行建议**：包含住宿、交通、餐饮和景点游览时间推荐
- 💾 **智能缓存机制**：减少API调用，提高响应速度
- 📱 **响应式设计**：适配各种设备尺寸，提供良好的移动端体验

## 🚀 快速开始

### 前提条件

- Node.js 16.x 或更高版本
- 高德地图API密钥
- 大语言模型API密钥 (如DeepSeek API)

### 安装步骤

1. 克隆仓库
```bash
git clone https://github.com/Drfccv/AI-Trip-Planner.git
cd AI-Trip-Planner
```

2. 安装依赖
```bash
npm install
```

3. 创建环境配置
在项目根目录创建`.env`文件，添加以下内容：
```
VITE_AMAP_API_KEY=你的高德地图API密钥
VITE_DEEPSEEK_API_KEY=你的大语言模型API密钥
```

4. 启动开发服务器
```bash
npm run dev
```

5. 打开浏览器访问 `http://localhost:5173`

## 🏗️ 技术栈

- **前端框架**: React + TypeScript
- **构建工具**: Vite
- **UI组件库**: Ant Design
- **地图服务**: 高德地图 JavaScript API
- **状态管理**: React Hooks
- **HTTP客户端**: Axios
- **AI服务**: 硅基流动API (Qwen/Qwen3-235B-A22B模型)

## 📝 使用指南

1. 在首页填写旅行信息表单:
   - 目的地城市
   - 旅行日期和天数
   - 交通方式偏好
   - 住宿偏好
   - 旅行风格标签

2. 点击"生成旅行计划"按钮

3. 系统将调用AI生成详细的旅行计划并展示:
   - 每日行程安排
   - 景点信息与推荐游览时间
   - 交通与住宿建议
   - 餐饮推荐
   - 天气预报
   - 互动地图

4. 可以随时返回调整参数重新规划

## 🧩 项目结构

```
src/
  ├── assets/        # 静态资源
  ├── components/    # 可复用组件
  │   ├── AmapComponent.tsx    # 高德地图组件
  │   ├── LoadingPage.tsx      # 加载页面组件
  │   ├── TripInputForm.tsx    # 旅行输入表单
  │   └── TripPlanResult.tsx   # 旅行计划结果展示
  ├── pages/         # 页面组件
  │   ├── HomePage.tsx         # 首页
  │   └── ResultPage.tsx       # 结果页
  ├── services/      # API服务
  │   └── api.ts              # API调用函数
  ├── types/         # TypeScript类型定义
  │   └── index.ts            # 类型定义文件
  └── utils/         # 工具函数
      └── mockData.ts         # 模拟数据
```

## 🌟 核心功能实现细节

### AI旅行计划生成

使用硅基流动提供的Qwen/Qwen3-235B-A22B大语言模型生成定制化的旅行计划。该模型是基于通义千问系列的超大规模语言模型，拥有2350亿参数量，具有强大的自然语言理解和生成能力。

系统会将用户的旅行偏好（目的地、日期、天数、交通方式、住宿偏好和旅行风格标签）格式化后发送给模型，模型会返回结构化的旅行计划JSON数据，包括：

- 每日详细行程安排
- 景点推荐与描述
- 游览时间建议
- 餐饮推荐
- 交通与住宿安排
- 根据用户偏好定制的总体建议

模型会基于城市特点、季节因素、用户偏好等多维度信息优化生成结果，并且会考虑景点之间的地理位置关系，合理安排游览顺序。

### 高德地图集成

- **景点定位**: 通过高德POI搜索API获取景点准确位置
- **路线规划**: 根据交通方式提供合理的游览路线
- **地图可视化**: 直观展示每日或全程的景点分布

### 天气信息

调用高德天气API获取目的地的实时天气预报，帮助用户做好行前准备。

## 📄 许可证

[MIT](LICENSE)

## 🤝 贡献指南

欢迎提交Pull Request或Issue！对于重大变更，请先开Issue讨论您想要改变的内容。

## 📞 联系方式

如有任何问题或建议，请通过以下方式联系我：

- Email: 2713587802@qq.com
- GitHub: [Drfccv](https://github.com/Drfccv)

---

**AI旅行规划助手** - 让旅行计划变得简单而智能，由Qwen/Qwen3-235B-A22B模型提供强大的AI能力支持 🌈
