import { useEffect, useEffectEvent, useRef, useState } from 'react';

const DEFAULT_COORDS = { lat: 37.5665, lon: 126.978 };
const WEATHER_LABELS = {
  0: 'Clear',
  1: 'Mostly clear',
  2: 'Partly cloudy',
  3: 'Overcast',
  45: 'Fog',
  48: 'Depositing rime fog',
  51: 'Light drizzle',
  53: 'Moderate drizzle',
  55: 'Dense drizzle',
  56: 'Freezing drizzle',
  57: 'Heavy freezing drizzle',
  61: 'Light rain',
  63: 'Moderate rain',
  65: 'Heavy rain',
  66: 'Freezing rain',
  67: 'Heavy freezing rain',
  71: 'Light snow',
  73: 'Moderate snow',
  75: 'Heavy snow',
  77: 'Snow grains',
  80: 'Rain showers',
  81: 'Heavy rain showers',
  82: 'Violent rain showers',
  85: 'Snow showers',
  86: 'Heavy snow showers',
  95: 'Thunderstorm',
  96: 'Thunderstorm with hail',
  99: 'Severe thunderstorm with hail',
};

const loadLeaflet = async () => {
  if (window.L) return window.L;

  const existingStylesheet = document.querySelector('link[data-leaflet]');
  if (!existingStylesheet) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    link.dataset.leaflet = 'true';
    document.head.appendChild(link);
  }

  await new Promise((resolve, reject) => {
    const existingScript = document.querySelector('script[data-leaflet]');

    if (existingScript) {
      if (window.L) {
        resolve();
        return;
      }

      existingScript.addEventListener('load', resolve, { once: true });
      existingScript.addEventListener('error', reject, { once: true });
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    script.dataset.leaflet = 'true';
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });

  return window.L;
};

const getWeatherLabel = (code) => WEATHER_LABELS[code] ?? 'Unknown weather';

const translateToKorean = async (text) => {
  if (!text) return text;

  try {
    const url =
      `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=ko&dt=t&q=` +
      encodeURIComponent(text);
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Translate request failed: ${response.status}`);
    }

    const data = await response.json();
    return data?.[0]?.map((item) => item?.[0] ?? '').join('') || text;
  } catch (error) {
    console.warn('Translation failed:', error);
    return text;
  }
};

export default function App() {
  const [fontSize, setFontSize] = useState(16);
  const [searchInput, setSearchInput] = useState('');
  const [weatherInfo, setWeatherInfo] = useState({
    country: '대한민국',
    region: '서울',
    weatherStatus: '지도를 클릭하거나 도시를 검색해 주세요.',
    recommendation: '날씨를 확인하면 옷차림 추천을 보여드릴게요.',
  });

  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const currentCoordsRef = useRef(DEFAULT_COORDS);

  const apiBaseUrl =
    (import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001').replace(/\/$/, '');

  const setMarker = (lat, lon) => {
    if (!mapRef.current || !window.L) return;

    if (markerRef.current) {
      markerRef.current.setLatLng([lat, lon]);
      return;
    }

    markerRef.current = window.L.marker([lat, lon]).addTo(mapRef.current);
  };

  const fetchClothingRecommendation = async (region, weatherText, temperature) => {
    setWeatherInfo((prev) => ({
      ...prev,
      recommendation: 'AI가 오늘의 옷차림을 정리하고 있어요.',
    }));

    try {
      const response = await fetch(`${apiBaseUrl}/api/recommend-clothing`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ region, weatherText, temperature }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error || 'Recommendation request failed');
      }

      setWeatherInfo((prev) => ({
        ...prev,
        recommendation:
          data.recommendation || '추천 결과가 비어 있어 기본 안내를 표시합니다.',
      }));
    } catch (error) {
      console.error('Recommendation error:', error);
      setWeatherInfo((prev) => ({
        ...prev,
        recommendation:
          '옷차림 추천을 불러오지 못했어요. 백엔드 URL과 Gemini 환경변수를 확인해 주세요.',
      }));
    }
  };

  const getWeatherByLocation = async (lat, lon) => {
    currentCoordsRef.current = { lat, lon };
    setMarker(lat, lon);

    setWeatherInfo({
      country: '위치 확인 중',
      region: '지역 정보를 찾는 중',
      weatherStatus: '날씨 정보를 불러오는 중',
      recommendation: '잠시만 기다려 주세요.',
    });

    let country = '알 수 없는 국가';
    let region = `${lat.toFixed(2)}, ${lon.toFixed(2)}`;

    try {
      const geoResponse = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&accept-language=ko`,
      );

      if (geoResponse.ok) {
        const geoData = await geoResponse.json();
        const address = geoData?.address;

        if (address) {
          country = address.country || country;
          region =
            address.city ||
            address.town ||
            address.village ||
            address.county ||
            address.state ||
            address.suburb ||
            region;
        } else if (geoData?.name) {
          region = geoData.name;
        }
      }
    } catch (error) {
      console.warn('Reverse geocoding failed:', error);
    }

    const translatedCountry = await translateToKorean(country);
    const translatedRegion = await translateToKorean(region);

    try {
      const weatherResponse = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code`,
      );

      if (!weatherResponse.ok) {
        throw new Error(`Weather request failed: ${weatherResponse.status}`);
      }

      const weatherData = await weatherResponse.json();
      const current = weatherData?.current;
      const temperature = current?.temperature_2m;
      const weatherCode = current?.weather_code;
      const weatherText = getWeatherLabel(weatherCode);
      const translatedWeather = await translateToKorean(weatherText);

      setWeatherInfo({
        country: translatedCountry || country,
        region: translatedRegion || region,
        weatherStatus: `${translatedWeather} · ${temperature}°C`,
        recommendation: '추천을 준비 중입니다.',
      });

      await fetchClothingRecommendation(translatedRegion || region, translatedWeather, temperature);
    } catch (error) {
      console.error('Weather error:', error);
      setWeatherInfo({
        country: translatedCountry || country,
        region: translatedRegion || region,
        weatherStatus: '날씨 정보를 불러오지 못했습니다.',
        recommendation: '잠시 후 다시 시도해 주세요.',
      });
    }
  };

  const handleMapSelection = useEffectEvent((lat, lon) => {
    void getWeatherByLocation(lat, lon);
  });

  const initializeMap = useEffectEvent(async () => {
    try {
      const L = await loadLeaflet();

      if (!mapContainerRef.current || mapRef.current) {
        return;
      }

      const map = L.map(mapContainerRef.current, { zoomControl: false }).setView(
        [DEFAULT_COORDS.lat, DEFAULT_COORDS.lon],
        7,
      );

      mapRef.current = map;

      L.control.zoom({ zoomInTitle: '확대', zoomOutTitle: '축소' }).addTo(map);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors',
      }).addTo(map);

      map.on('click', (event) => {
        handleMapSelection(event.latlng.lat, event.latlng.lng);
      });

      setMarker(DEFAULT_COORDS.lat, DEFAULT_COORDS.lon);
      await getWeatherByLocation(DEFAULT_COORDS.lat, DEFAULT_COORDS.lon);
    } catch (error) {
      console.error('Map initialization failed:', error);
      setWeatherInfo((prev) => ({
        ...prev,
        weatherStatus: '지도를 불러오지 못했습니다.',
        recommendation: '네트워크 상태를 확인해 주세요.',
      }));
    }
  });

  useEffect(() => {
    document.documentElement.style.fontSize = `${fontSize}px`;
  }, [fontSize]);

  useEffect(() => {
    void initializeMap();

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        markerRef.current = null;
      }
    };
  }, []);

  const searchCity = async () => {
    const query = searchInput.trim();

    if (!query) {
      window.alert('검색할 도시 이름을 입력해 주세요.');
      return;
    }

    try {
      setWeatherInfo((prev) => ({
        ...prev,
        country: '검색 중',
        region: `${query} 위치를 찾는 중`,
        weatherStatus: '잠시만 기다려 주세요.',
        recommendation: '검색 결과를 준비 중입니다.',
      }));

      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1&accept-language=ko`,
      );

      if (!response.ok) {
        throw new Error(`Search request failed: ${response.status}`);
      }

      const data = await response.json();

      if (!data?.length) {
        window.alert(`"${query}" 위치를 찾지 못했습니다.`);
        return;
      }

      const lat = Number(data[0].lat);
      const lon = Number(data[0].lon);

      mapRef.current?.setView([lat, lon], 10);
      setSearchInput('');
      await getWeatherByLocation(lat, lon);
    } catch (error) {
      console.error('City search failed:', error);
      setWeatherInfo((prev) => ({
        ...prev,
        weatherStatus: '도시 검색에 실패했습니다.',
        recommendation: '잠시 후 다시 시도해 주세요.',
      }));
    }
  };

  const findMyLocation = () => {
    const fallbackToIp = async () => {
      try {
        const response = await fetch('https://get.geojs.io/v1/ip/geo.json');

        if (!response.ok) {
          throw new Error(`IP lookup failed: ${response.status}`);
        }

        const data = await response.json();
        const lat = Number(data.latitude);
        const lon = Number(data.longitude);

        mapRef.current?.setView([lat, lon], 10);
        await getWeatherByLocation(lat, lon);
      } catch (error) {
        console.error('IP lookup failed:', error);
        setWeatherInfo((prev) => ({
          ...prev,
          weatherStatus: '현재 위치를 가져오지 못했습니다.',
          recommendation: '브라우저 위치 권한을 허용하거나 도시명을 검색해 주세요.',
        }));
      }
    };

    if (!navigator.geolocation) {
      void fallbackToIp();
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude;
        const lon = position.coords.longitude;
        mapRef.current?.setView([lat, lon], 10);
        void getWeatherByLocation(lat, lon);
      },
      () => {
        void fallbackToIp();
      },
      { enableHighAccuracy: false, timeout: 5000, maximumAge: 600000 },
    );
  };

  return (
    <div className="app-shell">
      <div className="app-card">
        <div className="toolbar">
          <button
            type="button"
            className="toolbar-button"
            onClick={() => setFontSize((prev) => Math.max(prev - 2, 12))}
          >
            A-
          </button>
          <button
            type="button"
            className="toolbar-button"
            onClick={() => setFontSize((prev) => Math.min(prev + 2, 24))}
          >
            A+
          </button>
        </div>

        <header className="hero">
          <p className="eyebrow">Interactive Weather</p>
          <h1>지도에서 바로 보는 날씨와 옷차림 추천</h1>
          <p className="hero-copy">
            도시를 검색하거나 지도에서 위치를 선택하면 현재 날씨와 AI 추천을 함께 보여줍니다.
          </p>

          <div className="search-row">
            <input
              type="text"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  void searchCity();
                }
              }}
              placeholder="예: 서울, 부산, 도쿄"
            />
            <button type="button" className="primary-button" onClick={() => void searchCity()}>
              검색
            </button>
          </div>
        </header>

        <section className="map-panel">
          <div ref={mapContainerRef} className="map-canvas" />
          <button type="button" className="location-button" onClick={findMyLocation}>
            내 위치
          </button>
        </section>

        <section className="info-grid">
          <article className="info-card">
            <span className="info-label">국가</span>
            <strong>{weatherInfo.country}</strong>
          </article>
          <article className="info-card">
            <span className="info-label">지역</span>
            <strong>{weatherInfo.region}</strong>
          </article>
          <article className="info-card wide">
            <span className="info-label">현재 날씨</span>
            <strong>{weatherInfo.weatherStatus}</strong>
          </article>
          <article className="info-card recommendation wide">
            <span className="info-label">AI 옷차림 추천</span>
            <p>{weatherInfo.recommendation}</p>
          </article>
        </section>
      </div>
    </div>
  );
}
