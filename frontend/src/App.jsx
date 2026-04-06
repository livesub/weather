import React, { useState, useEffect, useRef } from 'react';

export default function App() {
    // --- [1. 상태(State) 관리 영역] ---
    const [fontSize, setFontSize] = useState(16);
    const [searchInput, setSearchInput] = useState("");
    const [weatherInfo, setWeatherInfo] = useState({
        country: "국가",
        region: "지역 선택 전",
        weatherStatus: "지도를 클릭하세요",
        recommendation: "날씨를 확인하면 AI가 옷차림을 추천해 드립니다."
    });

    // --- [2. 참조(Ref) 관리 영역 (화면이 바뀌어도 지워지지 않는 메모장)] ---
    const mapContainerRef = useRef(null);
    const mapInstance = useRef(null);
    const currentMarker = useRef(null);
    const currentRadarLayer = useRef(null);
    const currentCoords = useRef({ lat: 37.7389, lon: 127.0339 });
    
    // [변경됨] 백엔드 서버가 API 키를 관리하므로 프론트엔드에서는 API 키 변수를 아예 삭제했습니다!

    // --- [3. 기능 함수 영역] ---

    const makeBigger = () => setFontSize(prev => Math.min(prev + 2, 24));
    const makeSmaller = () => setFontSize(prev => Math.max(prev - 2, 10));

    const translateToKorean = async (text) => {
        if (!text || text === "알 수 없는 국가" || text === "정확한 지명 없음 (바다 등)" || text.includes("위도:")) {
            return text;
        }
        try {
            const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=ko&dt=t&q=${encodeURIComponent(text)}`;
            const response = await fetch(url);
            const data = await response.json();
            return data[0][0][0];
        } catch (error) {
            console.warn("번역 실패:", error);
            return text;
        }
    };

    // ★ [핵심 변경됨] AI 옷차림 추천기: 이제 구글이 아니라 '우리의 백엔드 서버'로 요청을 보냅니다.
    const fetchClothingRecommendation = async (region, weatherText, temperature) => {
        setWeatherInfo(prev => ({ ...prev, recommendation: "AI가 옷차림을 고민하고 있어요... 🤔" }));
        
        // 우리의 백엔드 서버 주소로 연결합니다.
        const apiUrl = `http://localhost:3001/api/recommend-clothing`;
        
        // 서버에게 넘겨줄 데이터(지역, 날씨, 온도)를 포장합니다.
        const payload = { region, weatherText, temperature };

        let retries = 5;
        let delay = 1000;

        for (let i = 0; i < retries; i++) {
            try {
                // 백엔드 서버에 데이터 처리를 부탁(POST)합니다.
                const response = await fetch(apiUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                if (!response.ok) throw new Error("백엔드 서버 요청 실패");

                // 서버가 구글에서 받아온 정답을 넘겨주면 확인합니다.
                const data = await response.json();
                
                // 서버가 정답을 'recommendation'이라는 이름으로 잘 담아줬다면 화면에 띄웁니다.
                if (data.recommendation) {
                    setWeatherInfo(prev => ({ ...prev, recommendation: data.recommendation }));
                    return;
                } else {
                    throw new Error("데이터 형식 오류");
                }
            } catch (error) {
                if (i === retries - 1) {
                    setWeatherInfo(prev => ({ ...prev, recommendation: "옷차림 추천을 가져오지 못했어요. 😢 평소 이 온도에 입으시는 옷을 챙겨주세요!" }));
                } else {
                    await new Promise(resolve => setTimeout(resolve, delay));
                    delay *= 2;
                }
            }
        }
    };

    const getWeatherByLocation = async (lat, lon) => {
        currentCoords.current = { lat, lon };

        setWeatherInfo({
            country: "위치 확인 중...",
            region: "번역 중... ✍️",
            weatherStatus: "날씨 관측 중... 📡",
            recommendation: "대기 중..."
        });

        let newCountry = "알 수 없는 국가";
        let newRegion = "정확한 지명 없음 (바다 등)";

        try {
            const geoUrl = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&accept-language=ko`;
            const geoResponse = await fetch(geoUrl);
            if (geoResponse.ok) {
                const geoData = await geoResponse.json();
                if (geoData && geoData.address) {
                    newCountry = geoData.address.country || newCountry;
                    newRegion = geoData.address.city || geoData.address.town || geoData.address.village || geoData.address.county || geoData.address.suburb || geoData.address.province || newRegion;
                } else if (geoData && geoData.name) {
                    newRegion = geoData.name;
                }
            }
        } catch (error) {
            console.warn("주소 변환 에러:", error);
            newCountry = "위치 확인 불가";
            newRegion = `위도: ${lat.toFixed(2)}, 경도: ${lon.toFixed(2)}`;
        }

        newCountry = await translateToKorean(newCountry);
        newRegion = await translateToKorean(newRegion);

        setWeatherInfo(prev => ({ ...prev, country: newCountry, region: newRegion }));

        let weatherTextStr = "❓ 알 수 없음";
        let tempStr = "";

        try {
            const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weathercode`;
            let weatherResponse;

            for (let i = 0; i < 3; i++) {
                try {
                    weatherResponse = await fetch(weatherUrl);
                    if (weatherResponse.ok) break;
                } catch (e) {
                    if (i === 2) throw e; 
                    await new Promise(res => setTimeout(res, 1000)); 
                }
            }

            if (!weatherResponse || !weatherResponse.ok) {
                throw new Error("날씨 API 에러");
            }
            
            const weatherData = await weatherResponse.json();
            const temperature = weatherData.current.temperature_2m;
            const weatherCode = weatherData.current.weathercode;
            tempStr = temperature;
            
            if (weatherCode === 0) weatherTextStr = "☀️ 맑음";
            else if (weatherCode >= 1 && weatherCode <= 3) weatherTextStr = "⛅ 구름 조금/많음";
            else if (weatherCode === 45 || weatherCode === 48) weatherTextStr = "🌫️ 안개";
            else if (weatherCode >= 51 && weatherCode <= 67) weatherTextStr = "🌧️ 비";
            else if (weatherCode >= 71 && weatherCode <= 77) weatherTextStr = "❄️ 눈";
            else if (weatherCode >= 80 && weatherCode <= 82) weatherTextStr = "☔ 소나기";
            else if (weatherCode >= 95 && weatherCode <= 99) weatherTextStr = "⛈️ 천둥번개";

            setWeatherInfo(prev => ({ ...prev, weatherStatus: `${weatherTextStr} (${temperature}°C)` }));
        } catch (error) {
            console.error("날씨 에러 발생:", error);
            setWeatherInfo(prev => ({ 
                ...prev, 
                weatherStatus: "가져오기 실패 😢",
                recommendation: "날씨 정보를 가져오지 못해 옷차림을 추천할 수 없어요." 
            }));
            return; 
        }

        fetchClothingRecommendation(newRegion, weatherTextStr, tempStr);
    };

    const addRadarLayer = async () => {
        if (!mapInstance.current || !window.L) return;
        try {
            const response = await fetch('https://api.rainviewer.com/public/weather-maps.json');
            if(!response.ok) return;
            const data = await response.json();
            
            const latestPast = data.radar.past[data.radar.past.length - 1]; 
            const path = latestPast.path; 
            const radarUrl = `https://tilecache.rainviewer.com${path}/256/{z}/{x}/{y}/2/1_1.png`;

            if (currentRadarLayer.current != null) {
                mapInstance.current.removeLayer(currentRadarLayer.current);
            }

            currentRadarLayer.current = window.L.tileLayer(radarUrl, {
                opacity: 0.6,
                zIndex: 100,
                maxNativeZoom: 14
            }).addTo(mapInstance.current);

        } catch(e) {
            console.warn("레이더 이미지를 가져오는데 실패했습니다.", e);
        }
    };

    const updateMarker = (lat, lon) => {
        if (!mapInstance.current || !window.L) return;
        if (currentMarker.current != null) {
            mapInstance.current.removeLayer(currentMarker.current);
        }
        currentMarker.current = window.L.marker([lat, lon]).addTo(mapInstance.current);
    };

    const searchCity = async () => {
        const inputStr = searchInput.trim();
        if (!inputStr) {
            alert("검색할 도시 이름을 입력해주세요!");
            return;
        }

        setWeatherInfo(prev => ({
            ...prev,
            country: "검색 중...",
            region: "도시 위치를 찾는 중입니다 🔍",
            weatherStatus: "잠시만 기다려주세요",
            recommendation: "대기 중..."
        }));

        try {
            const searchUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(inputStr)}&format=json&limit=1&accept-language=ko`;
            const response = await fetch(searchUrl);
            const data = await response.json();

            if (data && data.length > 0) {
                const lat = parseFloat(data[0].lat);
                const lon = parseFloat(data[0].lon);

                mapInstance.current.setView([lat, lon], 10);
                updateMarker(lat, lon);
                getWeatherByLocation(lat, lon);
                setSearchInput(""); 
            } else {
                alert(`'${inputStr}' 위치를 찾을 수 없습니다.`);
                setWeatherInfo(prev => ({
                    ...prev,
                    country: "검색 실패",
                    region: "도시를 찾을 수 없습니다",
                    weatherStatus: "다시 시도해주세요 😢"
                }));
            }
        } catch (error) {
            console.error("도시 검색 중 에러:", error);
            alert("인터넷 연결을 확인해주세요.");
        }
    };

    const findMyLocation = () => {
        setWeatherInfo(prev => ({
            ...prev,
            country: "GPS",
            region: "내 위치 찾는 중...",
            weatherStatus: "위치 정보 권한을 확인하고 있습니다 📡"
        }));

        const fallbackToIP = async () => {
            try {
                setWeatherInfo(prev => ({ ...prev, region: "네트워크 위치 찾는 중..." }));
                const response = await fetch('https://get.geojs.io/v1/ip/geo.json');
                if (!response.ok) throw new Error("IP API 에러");
                const data = await response.json();
                
                const lat = parseFloat(data.latitude);
                const lon = parseFloat(data.longitude);

                mapInstance.current.setView([lat, lon], 10);
                updateMarker(lat, lon);
                getWeatherByLocation(lat, lon);
            } catch (ipError) {
                console.error("IP 위치 실패:", ipError);
                setWeatherInfo(prev => ({
                    ...prev,
                    region: "위치 찾기 실패",
                    weatherStatus: "권한을 허용하거나 다른 환경에서 시도해주세요 😢"
                }));
            }
        };

        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                function(position) {
                    const lat = position.coords.latitude;
                    const lon = position.coords.longitude;
                    mapInstance.current.setView([lat, lon], 10);
                    updateMarker(lat, lon);
                    getWeatherByLocation(lat, lon);
                },
                function(error) {
                    console.warn("브라우저 GPS 오류 (IP 위치로 대체):", error);
                    fallbackToIP();
                },
                { enableHighAccuracy: false, timeout: 5000, maximumAge: Infinity }
            );
        } else {
            fallbackToIP();
        }
    };

    // --- [4. 생명주기(useEffect) 관리 영역] ---
    useEffect(() => {
        document.documentElement.style.fontSize = `${fontSize}px`;
        document.documentElement.style.transition = 'font-size 0.3s ease-in-out';
    }, [fontSize]);

    useEffect(() => {
        const loadLeaflet = async () => {
            if (!window.L) {
                const link = document.createElement('link');
                link.rel = 'stylesheet';
                link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
                document.head.appendChild(link);

                const script = document.createElement('script');
                script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
                document.head.appendChild(script);
                
                await new Promise(resolve => {
                    script.onload = resolve;
                });
            }

            if (!mapContainerRef.current || mapInstance.current) return;

            const map = window.L.map(mapContainerRef.current, { zoomControl: false }).setView([37.7389, 127.0339], 3);
            mapInstance.current = map;

            map.attributionControl.setPrefix('');
            window.L.control.zoom({ zoomInTitle: '지도 확대', zoomOutTitle: '지도 축소' }).addTo(map);

            window.L.tileLayer('https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}&hl=ko', {
                attribution: '&copy; 구글 지도'
            }).addTo(map);

            map.on('click', function(e) {
                const lat = e.latlng.lat;
                const lon = e.latlng.lng;
                updateMarker(lat, lon);
                getWeatherByLocation(lat, lon);
            });

            addRadarLayer();
            updateMarker(37.7389, 127.0339);
            getWeatherByLocation(37.7389, 127.0339);
        };

        loadLeaflet();

        const intervalId = setInterval(() => {
            console.log("10분 경과: 날씨 및 레이더 자동 업데이트 중...");
            addRadarLayer();
            getWeatherByLocation(currentCoords.current.lat, currentCoords.current.lon);
        }, 600000);

        return () => clearInterval(intervalId); 
    }, []);

    // --- [5. 화면 그리기(JSX) 영역] ---
    return (
        <div className="p-4 bg-gradient-to-br from-blue-100 to-sky-200 min-h-screen flex justify-center items-center font-sans">
            <div className="bg-white rounded-3xl shadow-xl w-full max-w-sm overflow-hidden border border-gray-100 relative flex flex-col" style={{ height: '85vh' }}>
                
                <div className="absolute top-4 right-4 flex space-x-2 z-50">
                    <button onClick={makeSmaller} title="앱 화면 작게" className="bg-white/80 hover:bg-gray-200 text-gray-800 w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm shadow-md transition-colors">-</button>
                    <button onClick={makeBigger} title="앱 화면 크게" className="bg-white/80 hover:bg-gray-200 text-gray-800 w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm shadow-md transition-colors">+</button>
                </div>

                <div className="p-4 pb-2 z-20 bg-white">
                    <h1 className="text-xl font-bold text-gray-800 w-full text-center">🌍 세계 날씨 앱</h1>
                    <p className="text-xs text-center text-gray-500 mt-1 mb-3">지도에서 핀을 누르거나 도시를 검색하세요!</p>
                    
                    <div className="flex space-x-2">
                        <input 
                            type="text" 
                            value={searchInput}
                            onChange={(e) => setSearchInput(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && searchCity()}
                            placeholder="예: 서울, 파리, 뉴욕" 
                            className="flex-1 bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block p-2" 
                        />
                        <button onClick={searchCity} className="bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded-lg text-sm transition-colors shadow-sm">
                            검색
                        </button>
                    </div>
                </div>

                <div className="relative w-full flex-grow border-y border-gray-200 z-10">
                    <div ref={mapContainerRef} className="absolute inset-0 z-0"></div>
                    <button onClick={findMyLocation} title="내 위치 찾기" className="absolute bottom-4 right-4 z-[1000] bg-white text-xl w-10 h-10 rounded-full shadow-lg border border-gray-200 hover:bg-gray-100 transition-colors flex items-center justify-center cursor-pointer">
                        🎯
                    </button>
                </div>

                <div className="p-6 bg-blue-50 z-20">
                    <div className="text-center w-full">
                        <p className="text-sm font-bold text-blue-500 tracking-wider mb-1">{weatherInfo.country}</p>
                        <h2 className="text-3xl font-extrabold text-gray-800 mb-4">{weatherInfo.region}</h2>
                        
                        <div className="bg-white rounded-xl py-3 px-4 inline-block shadow-sm border border-blue-100 w-full">
                            <p className="text-sm text-gray-500 mb-1">현재 날씨 및 온도</p>
                            <p className="text-2xl font-bold text-gray-800">{weatherInfo.weatherStatus}</p>
                        </div>

                        <div className="bg-indigo-50 rounded-xl py-3 px-4 inline-block shadow-sm border border-indigo-100 w-full mt-3">
                            <p className="text-sm text-indigo-500 mb-1 font-bold flex items-center justify-center">
                                <span className="mr-1">✨</span> AI 옷차림 추천
                            </p>
                            <p className="text-sm font-medium text-gray-700 break-keep">{weatherInfo.recommendation}</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}