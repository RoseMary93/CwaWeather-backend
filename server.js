const result = require("dotenv").config();
const express = require("express");
const cors = require("cors");
const axios = require("axios");

const app = express();
const PORT = process.env.PORT || 3000;

// CWA API 設定
const CWA_API_BASE_URL = "https://opendata.cwa.gov.tw/api";
const CWA_API_KEY = process.env.CWA_API_KEY;

// 縣市名稱對照表 (網址參數 -> CWA API 格式)
const CITY_MAPPING = {
  taipei: "臺北市",
  newtaipei: "新北市",
  keelung: "基隆市",
  taoyuan: "桃園市",
  hsinchu_city: "新竹市",
  hsinchu_county: "新竹縣",
  miaoli: "苗栗縣",
  taichung: "臺中市",
  changhua: "彰化縣",
  nantou: "南投縣",
  yunlin: "雲林縣",
  chiayi_city: "嘉義市",
  chiayi_county: "嘉義縣",
  tainan: "臺南市",
  kaohsiung: "高雄市",
  pingtung: "屏東縣",
  yilan: "宜蘭縣",
  hualien: "花蓮縣",
  taitung: "臺東縣",
  penghu: "澎湖縣",
  kinmen: "金門縣",
  lienchiang: "連江縣",
};

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/**
 * 取得指定縣市天氣預報（短期 36 小時）
 */
const getWeather = async (req, res) => {
  try {
    const cityKey = req.params.city; // 取得網址上的參數 (例如: taipei)
    const locationName = CITY_MAPPING[cityKey]; // 轉換成中文 (例如: 臺北市)

    // 檢查縣市是否存在
    if (!locationName) {
      return res.status(400).json({
        error: "參數錯誤",
        message: "無效的縣市代碼",
      });
    }

    // 檢查是否有設定 API Key
    if (!CWA_API_KEY) {
      return res.status(500).json({
        error: "伺服器設定錯誤",
        message: "請在 .env 檔案中設定 CWA_API_KEY",
      });
    }

    // 呼叫 CWA API
    const response = await axios.get(
      `${CWA_API_BASE_URL}/v1/rest/datastore/F-C0032-001`,
      {
        params: {
          Authorization: CWA_API_KEY,
          locationName: locationName,
        },
      }
    );

    let locationData;
    if (response.data.records && response.data.records.location) {
      locationData = response.data.records.location[0];
    } else if (response.data.result && Array.isArray(response.data.result)) {
      locationData = response.data.result[0];
    }

    if (!locationData) {
      return res.status(404).json({
        error: "查無資料",
        message: "無法取得該縣市天氣資料",
      });
    }

    // 整理天氣資料
    const weatherData = {
      city: locationData.locationName,
      cityKey: cityKey, // 回傳原本的 key 方便前端對照
      updateTime: response.data.records.datasetDescription,
      forecasts: [],
    };

    // 解析天氣要素
    const weatherElements = locationData.weatherElement;
    const timeCount = weatherElements[0].time.length;

    for (let i = 0; i < timeCount; i++) {
      const forecast = {
        startTime: weatherElements[0].time[i].startTime,
        endTime: weatherElements[0].time[i].endTime,
        weather: "",
        rain: "",
        minTemp: "",
        maxTemp: "",
        comfort: "",
        windSpeed: "",
      };

      weatherElements.forEach((element) => {
        const value = element.time[i].parameter;
        switch (element.elementName) {
          case "Wx":
            forecast.weather = value.parameterName;
            break;
          case "PoP":
            forecast.rain = value.parameterName + "%";
            break;
          case "MinT":
            forecast.minTemp = value.parameterName + "°C";
            break;
          case "MaxT":
            forecast.maxTemp = value.parameterName + "°C";
            break;
          case "CI":
            forecast.comfort = value.parameterName;
            break;
          case "WS":
            forecast.windSpeed = value.parameterName;
            break;
        }
      });

      weatherData.forecasts.push(forecast);
    }

    res.json({
      success: true,
      data: weatherData,
    });
  } catch (error) {
    console.error("取得天氣資料失敗:", error.message);
    if (error.response) {
      return res.status(error.response.status).json({
        error: "CWA API 錯誤",
        message: error.response.data.message || "無法取得天氣資料",
      });
    }
    res.status(500).json({
      error: "伺服器錯誤",
      message: "無法取得天氣資料，請稍後再試",
    });
  }
};

/**
 * 取得指定縣市一週天氣預報（7 天）
 */
const getWeeklyWeather = async (req, res) => {
  try {
    const cityKey = req.params.city;
    const locationName = CITY_MAPPING[cityKey];

    // 檢查縣市是否存在
    if (!locationName) {
      return res.status(400).json({
        error: "參數錯誤",
        message: "無效的縣市代碼",
      });
    }

    // 檢查是否有設定 API Key
    if (!CWA_API_KEY) {
      return res.status(500).json({
        error: "伺服器設定錯誤",
        message: "請在 .env 檔案中設定 CWA_API_KEY",
      });
    }

    // 呼叫 CWA 一週預報 API（F-D0047-091）
    const response = await axios.get(
      `${CWA_API_BASE_URL}/v1/rest/datastore/F-D0047-091`,
      {
        params: {
          Authorization: CWA_API_KEY,
          locationName: locationName,
        },
      }
    );

    // 解析新 API 格式 - records.Locations[0].Location[0]
    let locationData;
    
    if (response.data.records && 
        response.data.records.Locations && 
        response.data.records.Locations[0] &&
        response.data.records.Locations[0].Location &&
        response.data.records.Locations[0].Location[0]) {
      locationData = response.data.records.Locations[0].Location[0];
    } else {
      console.error("[ERROR] API 回應結構異常，無法找到位置資料");
      console.error("[DEBUG] 完整回應鑰匙:", Object.keys(response.data));
      if (response.data.records) {
        console.error("[DEBUG] records 鑰匙:", Object.keys(response.data.records));
      }
      return res.status(404).json({
        error: "查無資料",
        message: "API 回應格式異常，無法解析位置資料",
      });
    }
    
    if (!locationData) {
      return res.status(404).json({
        error: "查無資料",
        message: "無法取得該縣市一週天氣資料",
      });
    }

    if (!locationData.WeatherElement || locationData.WeatherElement.length === 0) {
      return res.status(404).json({
        error: "查無資料",
        message: "無法找到天氣要素資料",
      });
    }

    // 整理一週天氣資料
    const weeklyData = {
      city: locationData.LocationName,
      cityKey: cityKey,
      forecasts: [],
    };

    const weatherElements = locationData.WeatherElement;

    // 建立一個日期到資料的 map
    const dailyData = {};

    // 遍歷所有天氣要素
    weatherElements.forEach((element) => {
      const elementName = element.ElementName;
      
      element.Time.forEach((timeData) => {
        const startTime = timeData.StartTime;
        const date = startTime.split("T")[0]; // 取得日期（YYYY-MM-DD）
        
        if (!dailyData[date]) {
          dailyData[date] = {
            date: date,
            dayOfWeek: "",
            weather: "",
            rainProb: "",
            minTemp: "",
            maxTemp: "",
            windSpeed: "",
          };

          // 計算星期幾
          const dateObj = new Date(date + "T00:00:00");
          const days = ["日", "一", "二", "三", "四", "五", "六"];
          dailyData[date].dayOfWeek = days[dateObj.getDay()];
        }

        // 根據元素名稱提取數據
        const elementValue = timeData.ElementValue ? timeData.ElementValue[0] : null;
        
        if (!elementValue) {
          console.log(`[DEBUG] ${elementName} 的 ElementValue 為空:`, timeData);
          return;
        }
        switch (elementName) {
          case "天氣現象":
            dailyData[date].weather = elementValue.Weather || "";
            break;
          case "最高溫度":
            dailyData[date].maxTemp = (elementValue.MaxTemperature || "") + "°C";
            break;
          case "最低溫度":
            dailyData[date].minTemp = (elementValue.MinTemperature || "") + "°C";
            break;
          case "12小時降雨機率":
            const probValue = elementValue.ProbabilityOfPrecipitation;
            if (probValue !== "-") {
              dailyData[date].rainProb = probValue + "%";
            }
            break;
          case "風速":
            dailyData[date].windSpeed = elementValue.WindSpeed || "";
            break;
        }
      });
    });

    // 轉換為陣列並排序
    weeklyData.forecasts = Object.values(dailyData).sort(
      (a, b) => new Date(a.date) - new Date(b.date)
    );

    res.json({
      success: true,
      data: weeklyData,
    });
  } catch (error) {
    console.error("取得一週天氣資料失敗:", error.message);
    console.error("詳細錯誤:", error);
    if (error.response) {
      console.error("API 回應狀態:", error.response.status);
      console.error("API 回應資料:", error.response.data);
      return res.status(error.response.status).json({
        error: "CWA API 錯誤",
        message: error.response.data.message || "無法取得天氣資料",
        details: error.response.data,
      });
    }
    res.status(500).json({
      error: "伺服器錯誤",
      message: "無法取得一週天氣資料，請稍後再試",
      details: error.message,
    });
  }
};

// Routes
app.get("/", (req, res) => {
  res.json({
    message: "歡迎使用 CWA 天氣預報 API",
    endpoints: {
      weather: "/api/weather/:city (例如 /api/weather/taipei)",
      weekly: "/api/weekly/:city (例如 /api/weekly/taipei)",
      health: "/api/health",
    },
    supported_cities: Object.keys(CITY_MAPPING),
  });
});

app.get("/api/health", (req, res) => {
  res.json({ status: "OK", timestamp: new Date().toISOString() });
});

// **修改這裡：改成動態路由接收 city 參數**
app.get("/api/weather/:city", getWeather);
app.get("/api/weekly/:city", getWeeklyWeather);

// Error handling
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    error: "伺服器錯誤",
    message: err.message,
  });
});

app.use((req, res) => {
  res.status(404).json({ error: "找不到此路徑" });
});

app.listen(PORT, () => {
  console.log(`🚀 伺服器運行已運作`);
  console.log(`📍 PORT: ${PORT}`);
});