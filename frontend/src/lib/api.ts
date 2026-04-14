/**
 * Backend API base URL. Set VITE_API_URL in .env (e.g. http://localhost:8000).
 */
export const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:8000";
export const API_BASE_URL = API_BASE;

function getJson<T>(url: string, init?: RequestInit): Promise<T> {
	return fetch(url, { ...init, headers: { ...(init?.headers ?? {}) } }).then(
		async (res) => {
			if (!res.ok) {
				const text = await res.text();
				throw new Error(text || `HTTP ${res.status}`);
			}
			return res.json();
		},
	);
}

export interface ListDetectionsResponse {
	items: Array<{
		id: string;
		species: string;
		confidence: number;
		bbox: [number, number, number, number];
		timestamp: string;
		location: { lat: number; lon: number; name: string };
		imageUrl?: string;
		enhancedImageUrl?: string;
	}>;
	total: number;
}

/** GET /api/detections - list detection history with optional filters */
export async function listDetections(params?: {
	species?: string | null;
	search?: string | null;
	limit?: number;
	offset?: number;
}): Promise<ListDetectionsResponse> {
	const sp = new URLSearchParams();
	if (params?.species != null && params.species !== "")
		sp.set("species", params.species);
	if (params?.search != null && params.search !== "")
		sp.set("search", params.search);
	if (params?.limit != null) sp.set("limit", String(params.limit));
	if (params?.offset != null) sp.set("offset", String(params.offset));
	const qs = sp.toString();
	const url = `${API_BASE}/api/detections${qs ? `?${qs}` : ""}`;
	return getJson<ListDetectionsResponse>(url);
}

/** POST /api/detections - upload image and run wildlife detection */
export async function createDetections(form: {
	image: File;
	location_name?: string | null;
	lat?: number | null;
	lon?: number | null;
	mode?: string;
}): Promise<{
	detections: ListDetectionsResponse["items"];
	timestamp: string;
	location: { lat: number; lon: number; name: string };
	enhancedImageUrl?: string;
}> {
	const body = new FormData();
	body.append("image", form.image);
	if (form.location_name != null && form.location_name !== "") {
		body.append("location_name", form.location_name);
	}
	if (form.lat != null) body.append("lat", String(form.lat));
	if (form.lon != null) body.append("lon", String(form.lon));

	const sp = new URLSearchParams();
	if (form.mode) sp.set("mode", form.mode);
	const qs = sp.toString();

	const res = await fetch(`${API_BASE}/api/detections${qs ? `?${qs}` : ""}`, {
		method: "POST",
		body,
	});
	if (!res.ok) {
		const text = await res.text();
		throw new Error(text || `HTTP ${res.status}`);
	}
	return res.json();
}

// --- Poaching Detection ---

export type PoachingStatus =
	| "Pending"
	| "Reviewed"
	| "Confirmed"
	| "False Positive";

export interface PoachingAlert {
	id: string;
	isSuspicious: boolean;
	confidence: number;
	alertSent: boolean;
	detectedObjects: string[];
	status: PoachingStatus;
	timestamp: string;
	location: { lat: number; lon: number; name: string };
	imageUrl?: string;
	processedImageUrl?: string;
	mode?: "normal" | "thermal" | "night";
}

export interface ListPoachingAlertsResponse {
	items: PoachingAlert[];
	total: number;
}

/** GET /api/poaching/alerts - list poaching alerts with optional filters */
export async function listPoachingAlerts(params?: {
	status?: string | null;
	search?: string | null;
	limit?: number;
	offset?: number;
}): Promise<ListPoachingAlertsResponse> {
	const sp = new URLSearchParams();
	if (params?.status != null && params.status !== "")
		sp.set("status", params.status);
	if (params?.search != null && params.search !== "")
		sp.set("search", params.search);
	if (params?.limit != null) sp.set("limit", String(params.limit));
	if (params?.offset != null) sp.set("offset", String(params.offset));
	const qs = sp.toString();
	const url = `${API_BASE}/api/poaching/alerts${qs ? `?${qs}` : ""}`;
	return getJson<ListPoachingAlertsResponse>(url);
}

/** POST /api/poaching/detect - upload image and run poaching detection */
export async function createPoachingAnalysis(form: {
	image: File;
	location_name?: string | null;
	lat?: number | null;
	lon?: number | null;
	confidence?: number | null;
	enable_telegram?: boolean;
	enable_email?: boolean;
	mode?: string;
}): Promise<PoachingAlert> {
	const body = new FormData();
	body.append("image", form.image);
	if (form.location_name != null && form.location_name !== "") {
		body.append("location_name", form.location_name);
	}
	if (form.lat != null) body.append("lat", String(form.lat));
	if (form.lon != null) body.append("lon", String(form.lon));
	if (form.confidence != null)
		body.append("confidence", String(form.confidence));
	body.append("enable_telegram", form.enable_telegram ? "true" : "false");
	body.append("enable_email", form.enable_email !== false ? "true" : "false");
	if (form.mode) body.append("mode", form.mode);

	const res = await fetch(`${API_BASE}/api/poaching/detect`, {
		method: "POST",
		body,
	});
	if (!res.ok) {
		const text = await res.text();
		throw new Error(text || `HTTP ${res.status}`);
	}
	return res.json();
}

/** POST /api/poaching/detect-base64 - continuous surveillance mode */
export async function detectPoachingBase64(form: {
	image: string; // base64
	mode: string;
	location_name?: string;
	lat?: number;
	lon?: number;
}): Promise<PoachingAlert> {
	const res = await fetch(`${API_BASE}/api/poaching/detect-base64`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(form),
	});
	if (!res.ok) {
		const text = await res.text();
		throw new Error(text || `HTTP ${res.status}`);
	}
	return res.json();
}


/** PATCH /api/poaching/alerts/{id} - update alert status */
export async function updatePoachingAlertStatus(
	alertId: string,
	status: PoachingStatus,
): Promise<PoachingAlert> {
	const res = await fetch(`${API_BASE}/api/poaching/alerts/${alertId}`, {
		method: "PATCH",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ status }),
	});
	if (!res.ok) {
		const text = await res.text();
		throw new Error(text || `HTTP ${res.status}`);
	}
	return res.json();
}

// --- Fire Prediction ---

export interface FirePredictionResponse {
	riskLevel: "Low" | "Medium" | "High" | "Critical";
	probability: number;
	forecast: { day: number; probability: number }[];
	recommendations: string;
	location: { lat: number; lon: number; name: string };
}

/** POST /api/fire/predict - predict fire risk from environmental conditions */
export async function predictFireRisk(params: {
	latitude: number;
	longitude: number;
	temperature: number;
	humidity: number;
	windSpeed: number;
	ndvi: number;
	month: string;
	location_name?: string | null;
}): Promise<FirePredictionResponse> {
	const body = new FormData();
	body.append("latitude", String(params.latitude));
	body.append("longitude", String(params.longitude));
	body.append("temperature", String(params.temperature));
	body.append("humidity", String(params.humidity));
	body.append("windSpeed", String(params.windSpeed));
	body.append("ndvi", String(params.ndvi));
	body.append("month", params.month);
	if (params.location_name != null && params.location_name !== "")
		body.append("location_name", params.location_name);

	const res = await fetch(`${API_BASE}/api/fire/predict`, {
		method: "POST",
		body,
	});
	if (!res.ok) {
		const text = await res.text();
		throw new Error(text || `HTTP ${res.status}`);
	}
	return res.json();
}

export interface FireHotspotItem {
	id: string;
	location: { lat: number; lon: number; name: string };
	riskLevel: "Low" | "Medium" | "High" | "Critical";
	probability: number;
	timestamp: string;
}

export interface ListFireHotspotsResponse {
	items: FireHotspotItem[];
	total: number;
}

/** GET /api/fire/hotspots - list saved fire hotspots (from predictions) */
export async function listFireHotspots(params?: {
	riskLevel?: string | null;
	limit?: number;
	offset?: number;
}): Promise<ListFireHotspotsResponse> {
	const sp = new URLSearchParams();
	if (params?.riskLevel != null && params.riskLevel !== "")
		sp.set("riskLevel", params.riskLevel);
	if (params?.limit != null) sp.set("limit", String(params.limit));
	if (params?.offset != null) sp.set("offset", String(params.offset));
	const qs = sp.toString();
	const url = `${API_BASE}/api/fire/hotspots${qs ? `?${qs}` : ""}`;
	return getJson<ListFireHotspotsResponse>(url);
}

// --- Habitat Suitability ---

export interface HabitatPredictionResponse {
	suitability: "High" | "Medium" | "Low";
	confidence: number;
	factors: {
		temperature: string;
		rainfall: string;
		elevation: string;
		forestCover: string;
		ndvi: string;
	};
	species: string;
	region: string;
}

/** POST /api/habitat/predict - predict habitat suitability (RandomForest from Colab) */
export async function predictHabitatSuitability(params: {
	species: string;
	region: string;
	temperature: number;
	rainfall: number;
	elevation: number;
	forestCover: number;
	ndvi: number;
}): Promise<HabitatPredictionResponse> {
	const body = new FormData();
	body.append("species", params.species);
	body.append("region", params.region);
	body.append("temperature", String(params.temperature));
	body.append("rainfall", String(params.rainfall));
	body.append("elevation", String(params.elevation));
	body.append("forestCover", String(params.forestCover));
	body.append("ndvi", String(params.ndvi));

	const res = await fetch(`${API_BASE}/api/habitat/predict`, {
		method: "POST",
		body,
	});
	if (!res.ok) {
		const text = await res.text();
		throw new Error(text || `HTTP ${res.status}`);
	}
	return res.json();
}


/** POST /api/fire/predict-image - predict wildfire risk from image (CNN) */
export async function predictFireRiskFromImage(form: {
	image: File;
	latitude?: number | null;
	longitude?: number | null;
	location_name?: string | null;
}): Promise<FirePredictionResponse> {
	const body = new FormData();
	body.append("image", form.image);
	if (form.latitude != null) body.append("latitude", String(form.latitude));
	if (form.longitude != null)
		body.append("longitude", String(form.longitude));
	if (form.location_name != null && form.location_name !== "")
		body.append("location_name", form.location_name);

	const res = await fetch(`${API_BASE}/api/fire/predict-image`, {
		method: "POST",
		body,
	});
	if (!res.ok) {
		const text = await res.text();
		throw new Error(text || `HTTP ${res.status}`);
	}
	return res.json();
}


// --- Map Data ---

export interface WildlifeMarker {
	id: string;
	lat: number;
	lng: number;
	species: string;
	confidence: number;
	imageUrl?: string;
	timestamp: string;
}

export interface PoachingMarker {
	id: string;
	lat: number;
	lng: number;
	status: string;
	confidence: number;
	imageUrl?: string;
	timestamp: string;
}

export interface FireMarker {
	id: string;
	lat: number;
	lng: number;
	riskLevel: string;
	probability: number;
	timestamp: string;
}

export interface MapDataResponse {
	wildlife: WildlifeMarker[];
	poaching: PoachingMarker[];
	fire: FireMarker[];
}

/** GET /map/data - returns all geo-tagged markers for the map view */
export async function getMapData(): Promise<MapDataResponse> {
	return getJson<MapDataResponse>(`${API_BASE}/map/data`);
}

// --- Analytics ---

export interface AnalyticsWildlife {
	bySpecies: { species: string; count: number }[];
	byMonth: Record<string, number | string>[];
}
export interface AnalyticsPoaching {
	byStatus: { status: string; count: number }[];
	byMonth: { month: string; count: number }[];
}
export interface AnalyticsFire {
	byRiskLevel: { riskLevel: string; count: number }[];
	byMonth: Record<string, number | string>[];
}

export const getAnalyticsWildlife = () =>
	getJson<AnalyticsWildlife>(`${API_BASE}/analytics/wildlife`);
export const getAnalyticsPoaching = () =>
	getJson<AnalyticsPoaching>(`${API_BASE}/analytics/poaching`);
export const getAnalyticsFire = () =>
	getJson<AnalyticsFire>(`${API_BASE}/analytics/fire`);

export interface MovementPredictionResponse {
	species: string;
	history?: Array<{
		timestamp: string;
		bbox: [number, number, number, number];
		confidence: number;
		location: { lat: number; lon: number; name: string };
	}>;
	prediction: {
		predicted_x: number;
		predicted_y: number;
		predicted_w: number;
		predicted_h: number;
		confidence: number;
		message: string;
	} | null;
	message?: string;
}

/** GET /api/detections/predict-movement/{species} */
export async function predictMovement(species: string): Promise<MovementPredictionResponse> {
	return getJson<MovementPredictionResponse>(`${API_BASE}/api/detections/predict-movement/${species}`);
}

// --- Grad-CAM Explainability ---

export interface GradCAMResponse {
	gradcam_image: string; // base64-encoded PNG
	explanation: string;
}

/** POST /api/detections/explain/{id} — run Grad-CAM and return heatmap + explanation */
export async function explainDetection(detectionId: string): Promise<GradCAMResponse> {
	const res = await fetch(`${API_BASE}/api/detections/explain/${detectionId}`, {
		method: "POST",
	});
	if (!res.ok) {
		const text = await res.text();
		throw new Error(text || `HTTP ${res.status}`);
	}
	return res.json();
}

// --- Ensemble Detection ---

export interface EnsembleDetection {
	species: string;
	confidence: number;   // 0-100
	votes: number;        // number of models that detected this species
	total_models: number; // total models that were run
	agreed: boolean;      // true when votes >= 2
}

export interface EnsembleResult {
	detections: EnsembleDetection[];
	total_models_run: number;
	high_confidence: EnsembleDetection[]; // agreed=true AND confidence > 70
}

/** POST /api/detections/ensemble — run all 3 models, return aggregated voting results */
export async function ensembleDetect(form: {
	image: File;
	location_name?: string | null;
	lat?: number | null;
	lon?: number | null;
}): Promise<EnsembleResult> {
	const body = new FormData();
	body.append("image", form.image);
	if (form.location_name != null && form.location_name !== "")
		body.append("location_name", form.location_name);
	if (form.lat != null) body.append("lat", String(form.lat));
	if (form.lon != null) body.append("lon", String(form.lon));

	const res = await fetch(`${API_BASE}/api/detections/ensemble`, {
		method: "POST",
		body,
	});
	if (!res.ok) {
		const text = await res.text();
		throw new Error(text || `HTTP ${res.status}`);
	}
	return res.json();
}

// --- Migration Corridor ---

export interface MigrationPoint {
	lat: number;
	lng: number;
	timestamp: string;
	sequence: number;
}

export interface MigrationInsights {
	dominant_direction: string;
	avg_speed_kmph: number;
	most_active_hour: number;
	most_active_period: string;
	estimated_range_km2: number;
}

export interface MigrationResponse {
	species: string;
	total_sightings: number;
	corridor: MigrationPoint[];
	insights: MigrationInsights;
}

/** GET /api/detections/migration/{species} */
export async function getMigrationCorridor(species: string): Promise<MigrationResponse> {
	return getJson<MigrationResponse>(`${API_BASE}/api/detections/migration/${species}`);
}

// --- Satellite Fire Detection ---

export interface SatelliteFire {
	lat: number;
	lng: number;
	severity: string;
	brightness: number;
	frp: number;
	confidence: string;
	satellite: string;
	acq_date: string;
	acq_time: string;
	daynight: string;
	carbon_emissions?: number;
}

export interface SatelliteFiresResponse {
	fires: SatelliteFire[];
	total: number;
	last_updated: string;
	source: string;
	bbox: string;
}

export interface SatelliteFiresSummary {
	total_fires: number;
	by_severity: Record<string, number>;
	hottest_fire: { lat: number; lng: number; frp: number; brightness: number } | null;
	most_active_region: string;
	last_updated: string;
}

export interface SatelliteFiresHistory {
	history: { date: string; count: number; avg_frp: number }[];
}

/** GET /api/satellite/fires */
export async function getSatelliteFires(): Promise<SatelliteFiresResponse> {
	return getJson<SatelliteFiresResponse>(`${API_BASE}/api/satellite/fires`);
}

/** GET /api/satellite/fires/summary */
export async function getSatelliteFiresSummary(): Promise<SatelliteFiresSummary> {
	return getJson<SatelliteFiresSummary>(`${API_BASE}/api/satellite/fires/summary`);
}

/** GET /api/satellite/fires/history?days=n */
export async function getSatelliteFiresHistory(days: number = 7): Promise<SatelliteFiresHistory> {
	return getJson<SatelliteFiresHistory>(`${API_BASE}/api/satellite/fires/history?days=${days}`);
}

// --- Carbon Estimation ---

export interface CarbonEstimate {
	id: string;
	burned_area_ha: number;
	dry_matter_burned_t: number;
	emissions: {
		co2_tonnes: number;
		ch4_tonnes: number;
		n2o_tonnes: number;
		co2_equivalent: number;
	};
	context: {
		equivalent_cars_yearly: number;
		equivalent_flights: number;
		trees_needed_to_offset: number;
		equivalent_homes_yearly: number;
	};
	forest_type: string;
	biomass_density: number;
	combustion_factor: number;
	methodology: string;
	lat: number;
	lng: number;
	fire_date: string;
	created_at: string;
}

export interface CarbonEstimatesResponse {
	estimates: CarbonEstimate[];
	total_co2_equivalent: number;
	count: number;
}

export interface CarbonEstimateRequest {
	burned_area_ha: number;
	forest_type: string;
	frp_mw?: number;
	duration_hours: number;
	lat: number;
	lng: number;
	fire_date: string;
}

/** POST /api/satellite/carbon-estimate */
export async function createCarbonEstimate(req: CarbonEstimateRequest): Promise<CarbonEstimate> {
	const res = await fetch(`${API_BASE}/api/satellite/carbon-estimate`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(req),
	});
	if (!res.ok) {
		const text = await res.text();
		throw new Error(text || `HTTP ${res.status}`);
	}
	return res.json();
}

/** GET /api/satellite/carbon-estimates */
export async function listCarbonEstimates(): Promise<CarbonEstimatesResponse> {
	return getJson<CarbonEstimatesResponse>(`${API_BASE}/api/satellite/carbon-estimates`);
}
