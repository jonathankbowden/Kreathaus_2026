/* =============================================
   WEATHER ENGINE — Dynamic theme from Boulder, CO
   Uses Open-Meteo (free, no API key)
   Drives: orb palette, background, typography contrast
   ============================================= */

class WeatherEngine {
    constructor() {
        // Boulder, CO coordinates
        this.lat = 40.015;
        this.lon = -105.2705;
        this.timezone = 'America/Denver';

        // State
        this.weather = null;
        this.sunTimes = null;
        this.timeOfDay = 'day'; // dawn, morning, day, afternoon, golden, dusk, night
        this.season = 'winter';
        this.condition = 'clear'; // clear, cloudy, overcast, rain, snow, storm

        // Palettes for each condition
        this.palettes = this.definePalettes();

        this.init();
    }

    definePalettes() {
        return {
            // === DAY PALETTES ===
            day_clear: {
                c1: { r: 232, g: 85, b: 58 },     // vermilion
                c2: { r: 244, g: 162, b: 97 },     // amber
                c3: { r: 38, g: 70, b: 83 },       // deep teal
                c4: { r: 26, g: 26, b: 26 },       // near black
                bg: { r: 245, g: 240, b: 232 },    // warm cream
            },
            day_cloudy: {
                c1: { r: 200, g: 110, b: 90 },     // muted coral
                c2: { r: 220, g: 180, b: 140 },    // sand
                c3: { r: 80, g: 100, b: 110 },     // slate
                c4: { r: 40, g: 40, b: 45 },       // charcoal
                bg: { r: 235, g: 232, b: 228 },    // cool cream
            },
            day_overcast: {
                c1: { r: 170, g: 130, b: 120 },    // dusty rose
                c2: { r: 190, g: 180, b: 165 },    // stone
                c3: { r: 100, g: 110, b: 120 },    // steel
                c4: { r: 50, g: 50, b: 55 },       // dark gray
                bg: { r: 228, g: 226, b: 224 },    // overcast gray
            },
            day_rain: {
                c1: { r: 100, g: 140, b: 170 },    // rain blue
                c2: { r: 140, g: 170, b: 180 },    // pewter
                c3: { r: 60, g: 80, b: 100 },      // deep blue-gray
                c4: { r: 30, g: 35, b: 45 },       // dark navy
                bg: { r: 225, g: 228, b: 232 },    // rain gray
            },
            day_snow: {
                c1: { r: 200, g: 210, b: 225 },    // ice blue
                c2: { r: 230, g: 235, b: 240 },    // frost
                c3: { r: 150, g: 165, b: 180 },    // winter blue
                c4: { r: 60, g: 70, b: 85 },       // deep winter
                bg: { r: 240, g: 242, b: 245 },    // snow white
            },

            // === DAWN ===
            dawn_clear: {
                c1: { r: 240, g: 140, b: 100 },    // soft peach
                c2: { r: 250, g: 200, b: 150 },    // golden dawn
                c3: { r: 100, g: 80, b: 120 },     // pre-dawn purple
                c4: { r: 30, g: 25, b: 40 },       // dark violet
                bg: { r: 240, g: 235, b: 230 },    // warm pearl
            },

            // === GOLDEN HOUR ===
            golden_clear: {
                c1: { r: 245, g: 120, b: 60 },     // deep orange
                c2: { r: 255, g: 180, b: 80 },     // golden
                c3: { r: 180, g: 60, b: 50 },      // burnt sienna
                c4: { r: 35, g: 25, b: 25 },       // dark earth
                bg: { r: 248, g: 240, b: 228 },    // golden cream
            },

            // === DUSK ===
            dusk_clear: {
                c1: { r: 220, g: 80, b: 80 },      // sunset red
                c2: { r: 240, g: 140, b: 60 },     // tangerine
                c3: { r: 60, g: 50, b: 90 },       // twilight purple
                c4: { r: 20, g: 18, b: 30 },       // near black-blue
                bg: { r: 35, g: 30, b: 45 },       // dusk
            },

            // === NIGHT ===
            night_clear: {
                c1: { r: 80, g: 60, b: 140 },      // deep purple
                c2: { r: 40, g: 80, b: 130 },      // midnight blue
                c3: { r: 20, g: 30, b: 60 },       // dark navy
                c4: { r: 8, g: 8, b: 15 },         // void
                bg: { r: 10, g: 10, b: 15 },       // night black
            },
            night_cloudy: {
                c1: { r: 70, g: 60, b: 80 },       // muted purple
                c2: { r: 50, g: 55, b: 70 },       // gray-blue
                c3: { r: 30, g: 30, b: 45 },       // dark
                c4: { r: 10, g: 10, b: 15 },       // void
                bg: { r: 12, g: 12, b: 16 },       // night
            },
            night_snow: {
                c1: { r: 120, g: 130, b: 160 },    // moonlit blue
                c2: { r: 80, g: 90, b: 120 },      // cold blue
                c3: { r: 40, g: 45, b: 65 },       // dark blue
                c4: { r: 15, g: 15, b: 25 },       // deep
                bg: { r: 15, g: 16, b: 22 },       // night
            },
        };
    }

    async init() {
        // Calculate time-based state immediately (no API needed)
        this.updateTimeState();
        this.applyTheme();

        // Then fetch real weather
        try {
            await this.fetchWeather();
        } catch (e) {
            console.warn('Weather fetch failed, using time-based defaults:', e);
        }

        // Update theme with weather data
        this.applyTheme();

        // Refresh every 10 minutes
        setInterval(() => {
            this.updateTimeState();
            this.applyTheme();
        }, 60000);

        // Fetch new weather every 15 min
        setInterval(() => this.fetchWeather(), 900000);
    }

    async fetchWeather() {
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${this.lat}&longitude=${this.lon}&current=temperature_2m,weather_code,cloud_cover,is_day,wind_speed_10m&daily=sunrise,sunset&timezone=${this.timezone}&forecast_days=1`;

        const resp = await fetch(url);
        if (!resp.ok) throw new Error(`Weather API ${resp.status}`);

        const data = await resp.json();
        this.weather = data.current;

        // Parse sun times
        if (data.daily) {
            this.sunTimes = {
                sunrise: new Date(data.daily.sunrise[0]),
                sunset: new Date(data.daily.sunset[0]),
            };
        }

        this.updateTimeState();
        this.updateWeatherUI(data);
    }

    updateTimeState() {
        const now = new Date();
        // Convert to Boulder time
        const boulderTime = new Date(now.toLocaleString('en-US', { timeZone: this.timezone }));
        const hour = boulderTime.getHours();
        const minute = boulderTime.getMinutes();
        const timeMinutes = hour * 60 + minute;

        // Determine season
        const month = boulderTime.getMonth(); // 0-indexed
        if (month >= 2 && month <= 4) this.season = 'spring';
        else if (month >= 5 && month <= 7) this.season = 'summer';
        else if (month >= 8 && month <= 10) this.season = 'fall';
        else this.season = 'winter';

        // Determine time of day using sun times or defaults
        let sunriseMin = 6 * 60 + 30;  // 6:30 default
        let sunsetMin = 17 * 60 + 30;  // 17:30 default

        if (this.sunTimes) {
            const sr = new Date(this.sunTimes.sunrise.toLocaleString('en-US', { timeZone: this.timezone }));
            const ss = new Date(this.sunTimes.sunset.toLocaleString('en-US', { timeZone: this.timezone }));
            sunriseMin = sr.getHours() * 60 + sr.getMinutes();
            sunsetMin = ss.getHours() * 60 + ss.getMinutes();
        }

        if (timeMinutes < sunriseMin - 40) {
            this.timeOfDay = 'night';
        } else if (timeMinutes < sunriseMin + 20) {
            this.timeOfDay = 'dawn';
        } else if (timeMinutes < sunriseMin + 120) {
            this.timeOfDay = 'morning';
        } else if (timeMinutes < sunsetMin - 90) {
            this.timeOfDay = 'day';
        } else if (timeMinutes < sunsetMin - 20) {
            this.timeOfDay = 'golden';
        } else if (timeMinutes < sunsetMin + 40) {
            this.timeOfDay = 'dusk';
        } else {
            this.timeOfDay = 'night';
        }

        // Determine weather condition
        if (this.weather) {
            const code = this.weather.weather_code;
            const cloud = this.weather.cloud_cover;

            if (code >= 71 || code === 77 || code >= 85) {
                this.condition = 'snow';
            } else if (code >= 61 || code >= 51 && code <= 57 || code >= 80 && code <= 82) {
                this.condition = 'rain';
            } else if (code >= 95) {
                this.condition = 'storm';
            } else if (cloud > 80) {
                this.condition = 'overcast';
            } else if (cloud > 40) {
                this.condition = 'cloudy';
            } else {
                this.condition = 'clear';
            }
        }
    }

    getPalette() {
        // Map time + condition to palette key
        const timeKey = (this.timeOfDay === 'morning') ? 'day' : this.timeOfDay;
        const condKey = this.condition;

        // Try exact match first
        let key = `${timeKey}_${condKey}`;
        if (this.palettes[key]) return this.palettes[key];

        // Fall back: try time_clear
        key = `${timeKey}_clear`;
        if (this.palettes[key]) return this.palettes[key];

        // Fall back to day_clear
        return this.palettes.day_clear;
    }

    applyTheme() {
        const palette = this.getPalette();
        const isDark = ['night', 'dusk'].includes(this.timeOfDay);
        const root = document.documentElement;

        // Set dark/light mode
        root.setAttribute('data-theme', isDark ? 'dark' : 'light');

        // Update CSS custom properties for background
        const bg = palette.bg;
        root.style.setProperty('--bg-primary', `rgb(${bg.r}, ${bg.g}, ${bg.b})`);
        root.style.setProperty('--orb-glow', `rgba(${palette.c1.r}, ${palette.c1.g}, ${palette.c1.b}, 0.15)`);

        // Compute appropriate text colors for the background
        const bgLum = (bg.r * 0.299 + bg.g * 0.587 + bg.b * 0.114) / 255;

        if (bgLum < 0.4) {
            // Dark background
            root.style.setProperty('--text-primary', '#e8e4de');
            root.style.setProperty('--text-secondary', '#a8a4a0');
            root.style.setProperty('--text-muted', '#605c58');
            root.style.setProperty('--surface', 'rgba(255, 255, 255, 0.04)');
            root.style.setProperty('--surface-hover', 'rgba(255, 255, 255, 0.08)');
            root.style.setProperty('--border', 'rgba(255, 255, 255, 0.06)');
        } else {
            // Light background
            root.style.setProperty('--text-primary', '#1a1a1a');
            root.style.setProperty('--text-secondary', '#4a4a4a');
            root.style.setProperty('--text-muted', '#8a8a8a');
            root.style.setProperty('--surface', 'rgba(255, 255, 255, 0.4)');
            root.style.setProperty('--surface-hover', 'rgba(255, 255, 255, 0.6)');
            root.style.setProperty('--border', 'rgba(0, 0, 0, 0.06)');
        }

        // Accent color from palette
        root.style.setProperty('--text-accent', `rgb(${palette.c1.r}, ${palette.c1.g}, ${palette.c1.b})`);

        // Update orb
        if (window.orbEngine) {
            window.orbEngine.setPalette(palette);
        }

        // Season-based grain adjustment
        const grainMap = {
            winter: 0.05,
            spring: 0.03,
            summer: 0.03,
            fall: 0.04,
        };
        root.style.setProperty('--bg-grain-opacity', grainMap[this.season] || 0.04);
    }

    updateWeatherUI(data) {
        const badge = document.getElementById('weatherBadge');
        const text = document.getElementById('weatherText');
        const footerTime = document.getElementById('footerTime');
        const footerWeather = document.getElementById('footerWeather');
        const footerSeason = document.getElementById('footerSeason');

        if (!data || !data.current) return;

        const temp = Math.round(data.current.temperature_2m);
        const tempF = Math.round(temp * 9 / 5 + 32);
        const conditionText = this.getConditionText(data.current.weather_code);

        if (text) {
            text.textContent = `Boulder · ${tempF}°F · ${conditionText}`;
        }
        if (badge) {
            badge.classList.add('loaded');
        }

        // Footer conditions
        const now = new Date();
        const boulderTime = new Date(now.toLocaleString('en-US', { timeZone: this.timezone }));
        const timeStr = boulderTime.toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            timeZone: this.timezone,
        });

        if (footerTime) footerTime.textContent = timeStr + ' MT';
        if (footerWeather) footerWeather.textContent = `${tempF}°F ${conditionText}`;
        if (footerSeason) footerSeason.textContent = this.season.charAt(0).toUpperCase() + this.season.slice(1);
    }

    getConditionText(code) {
        if (code === 0) return 'Clear';
        if (code <= 3) return 'Partly Cloudy';
        if (code <= 48) return 'Foggy';
        if (code <= 57) return 'Drizzle';
        if (code <= 67) return 'Rain';
        if (code <= 77) return 'Snow';
        if (code <= 82) return 'Showers';
        if (code <= 86) return 'Snow Showers';
        if (code >= 95) return 'Thunderstorm';
        return 'Cloudy';
    }
}

// Initialize
window.weatherEngine = new WeatherEngine();
