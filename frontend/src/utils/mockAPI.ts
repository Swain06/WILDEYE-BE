import type {
  WildlifeDetectionResult,
  HabitatPrediction,
  FirePrediction,
  PoachingAlert,
  Detection,
  FireHotspot,
  ActivityEvent,
} from '@/types';

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const SPECIES_LIST = ['Tiger', 'Elephant', 'Deer', 'Leopard', 'Bear', 'Wolf', 'Boar', 'Monkey', 'Peacock'];
const LOCATIONS = [
  { lat: 22.3320, lon: 80.6302, name: 'Kanha National Park' },
  { lat: 26.5775, lon: 93.1711, name: 'Kaziranga National Park' },
  { lat: 23.4700, lon: 80.1500, name: 'Bandhavgarh Tiger Reserve' },
  { lat: 11.6000, lon: 76.6333, name: 'Mudumalai National Park' },
  { lat: 27.5500, lon: 83.2333, name: 'Chitwan National Park' },
];

export async function detectWildlife(): Promise<WildlifeDetectionResult> {
  await delay(1500 + Math.random() * 1000);

  const numDetections = Math.floor(Math.random() * 3) + 1;
  const detections: Detection[] = [];
  const usedSpecies = new Set<string>();

  for (let i = 0; i < numDetections; i++) {
    let species = SPECIES_LIST[Math.floor(Math.random() * SPECIES_LIST.length)];
    while (usedSpecies.has(species)) {
      species = SPECIES_LIST[Math.floor(Math.random() * SPECIES_LIST.length)];
    }
    usedSpecies.add(species);

    detections.push({
      id: `DET-${Date.now()}-${i}`,
      species,
      confidence: 75 + Math.random() * 20,
      bbox: [
        Math.floor(Math.random() * 200) + 50,
        Math.floor(Math.random() * 150) + 30,
        Math.floor(Math.random() * 200) + 300,
        Math.floor(Math.random() * 200) + 200,
      ],
      timestamp: new Date().toISOString(),
      location: LOCATIONS[Math.floor(Math.random() * LOCATIONS.length)],
    });
  }

  return {
    detections,
    timestamp: new Date().toISOString(),
    location: LOCATIONS[Math.floor(Math.random() * LOCATIONS.length)],
  };
}

export async function predictHabitat(params: {
  species: string;
  region: string;
  temperature: number;
  rainfall: number;
  elevation: number;
  forestCover: number;
  ndvi: number;
}): Promise<HabitatPrediction> {
  await delay(1200 + Math.random() * 800);

  const { temperature, rainfall, elevation, forestCover, ndvi } = params;

  // Simple logic to determine suitability
  let score = 0;
  const factors: HabitatPrediction['factors'] = {
    temperature: 'Suboptimal',
    rainfall: 'Low',
    elevation: 'Unsuitable',
    forestCover: 'Poor',
    ndvi: 'Low',
  };

  if (temperature >= 15 && temperature <= 35) {
    score += 20;
    factors.temperature = temperature >= 20 && temperature <= 30 ? 'Optimal' : 'Suitable';
  }

  if (rainfall >= 500) {
    score += rainfall >= 1000 ? 20 : 10;
    factors.rainfall = rainfall >= 1000 ? 'Sufficient' : 'Moderate';
  }

  if (elevation >= 200 && elevation <= 3000) {
    score += 20;
    factors.elevation = 'Suitable';
  }

  if (forestCover >= 30) {
    score += forestCover >= 60 ? 20 : 15;
    factors.forestCover = forestCover >= 60 ? 'Good' : 'Moderate';
  }

  if (ndvi >= 0.3) {
    score += ndvi >= 0.6 ? 20 : 10;
    factors.ndvi = ndvi >= 0.6 ? 'Healthy' : 'Moderate';
  }

  let suitability: 'High' | 'Medium' | 'Low' = 'Low';
  if (score >= 70) suitability = 'High';
  else if (score >= 40) suitability = 'Medium';

  return {
    suitability,
    confidence: 70 + Math.random() * 25,
    factors,
    species: params.species,
    region: params.region,
  };
}

export async function predictFireRisk(params: {
  latitude: number;
  longitude: number;
  temperature: number;
  humidity: number;
  windSpeed: number;
  ndvi: number;
  month: string;
}): Promise<FirePrediction> {
  await delay(1500 + Math.random() * 1000);

  const { temperature, humidity, windSpeed } = params;

  // Calculate risk based on inputs
  let riskScore = 0;
  if (temperature > 35) riskScore += 30;
  else if (temperature > 30) riskScore += 20;
  else if (temperature > 25) riskScore += 10;

  if (humidity < 30) riskScore += 30;
  else if (humidity < 50) riskScore += 20;
  else if (humidity < 70) riskScore += 10;

  if (windSpeed > 30) riskScore += 25;
  else if (windSpeed > 20) riskScore += 15;
  else if (windSpeed > 10) riskScore += 5;

  let riskLevel: FirePrediction['riskLevel'] = 'Low';
  let probability = 0.15 + Math.random() * 0.15;

  if (riskScore >= 70) {
    riskLevel = 'Critical';
    probability = 0.8 + Math.random() * 0.15;
  } else if (riskScore >= 50) {
    riskLevel = 'High';
    probability = 0.6 + Math.random() * 0.2;
  } else if (riskScore >= 30) {
    riskLevel = 'Medium';
    probability = 0.35 + Math.random() * 0.25;
  }

  const forecast = [];
  let baseProbability = probability;
  for (let day = 1; day <= 7; day++) {
    baseProbability = Math.max(0.1, Math.min(0.95, baseProbability + (Math.random() - 0.5) * 0.15));
    forecast.push({ day, probability: baseProbability });
  }

  const recommendations = {
    Low: 'Conditions are favorable. Continue routine monitoring.',
    Medium: 'Elevated risk detected. Increase patrol frequency and ensure firefighting equipment is ready.',
    High: 'High fire risk! Alert fire response teams and prepare for potential evacuation.',
    Critical: 'CRITICAL ALERT! Immediate action required. Activate all emergency protocols and notify authorities.',
  };

  return {
    riskLevel,
    probability,
    forecast,
    recommendations: recommendations[riskLevel],
    location: LOCATIONS[Math.floor(Math.random() * LOCATIONS.length)],
  };
}

export async function analyzePoaching(): Promise<PoachingAlert> {
  await delay(1800 + Math.random() * 1200);

  const isSuspicious = Math.random() > 0.3;
  const detectedObjects = [];

  if (isSuspicious) {
    const possibleObjects = ['Human presence', 'Vehicle', 'Trap', 'Campfire', 'Weapons', 'Unusual movement'];
    const numObjects = Math.floor(Math.random() * 3) + 1;
    for (let i = 0; i < numObjects; i++) {
      const obj = possibleObjects[Math.floor(Math.random() * possibleObjects.length)];
      if (!detectedObjects.includes(obj)) detectedObjects.push(obj);
    }
  }

  return {
    id: `PA-${Date.now()}`,
    isSuspicious,
    confidence: isSuspicious ? 70 + Math.random() * 25 : 30 + Math.random() * 30,
    alertSent: isSuspicious,
    detectedObjects,
    status: 'Pending',
    timestamp: new Date().toISOString(),
    location: LOCATIONS[Math.floor(Math.random() * LOCATIONS.length)],
  };
}

// Initial mock data
export const initialDetections: Detection[] = [
  {
    id: 'DET-001',
    species: 'Tiger',
    confidence: 94.5,
    bbox: [120, 80, 320, 280],
    timestamp: new Date(Date.now() - 30 * 60000).toISOString(),
    location: { lat: 22.3320, lon: 80.6302, name: 'Kanha National Park' },
  },
  {
    id: 'DET-002',
    species: 'Elephant',
    confidence: 91.2,
    bbox: [200, 150, 450, 400],
    timestamp: new Date(Date.now() - 45 * 60000).toISOString(),
    location: { lat: 26.5775, lon: 93.1711, name: 'Kaziranga National Park' },
  },
  {
    id: 'DET-003',
    species: 'Deer',
    confidence: 87.8,
    bbox: [350, 100, 500, 280],
    timestamp: new Date(Date.now() - 60 * 60000).toISOString(),
    location: { lat: 23.4700, lon: 80.1500, name: 'Bandhavgarh Tiger Reserve' },
  },
  {
    id: 'DET-004',
    species: 'Leopard',
    confidence: 89.3,
    bbox: [150, 120, 380, 350],
    timestamp: new Date(Date.now() - 120 * 60000).toISOString(),
    location: { lat: 11.6000, lon: 76.6333, name: 'Mudumalai National Park' },
  },
  {
    id: 'DET-005',
    species: 'Bear',
    confidence: 85.6,
    bbox: [100, 80, 300, 320],
    timestamp: new Date(Date.now() - 180 * 60000).toISOString(),
    location: { lat: 27.5500, lon: 83.2333, name: 'Chitwan National Park' },
  },
];

export const initialFireHotspots: FireHotspot[] = [
  {
    id: 'FH-001',
    location: { lat: 10.0, lon: 77.0, name: 'Western Ghats - Kerala' },
    riskLevel: 'High',
    probability: 0.78,
    timestamp: new Date(Date.now() - 15 * 60000).toISOString(),
  },
  {
    id: 'FH-002',
    location: { lat: 22.5, lon: 78.5, name: 'Dry Forests - Madhya Pradesh' },
    riskLevel: 'Medium',
    probability: 0.62,
    timestamp: new Date(Date.now() - 45 * 60000).toISOString(),
  },
  {
    id: 'FH-003',
    location: { lat: 15.5, lon: 74.5, name: 'Goa Forest Reserve' },
    riskLevel: 'Low',
    probability: 0.28,
    timestamp: new Date(Date.now() - 90 * 60000).toISOString(),
  },
];

export const initialPoachingAlerts: PoachingAlert[] = [
  {
    id: 'PA-001',
    isSuspicious: true,
    confidence: 89.1,
    alertSent: true,
    detectedObjects: ['Human presence', 'Vehicle'],
    status: 'Pending',
    timestamp: new Date(Date.now() - 20 * 60000).toISOString(),
    location: { lat: 22.3320, lon: 80.6302, name: 'Kanha National Park' },
  },
  {
    id: 'PA-002',
    isSuspicious: true,
    confidence: 76.4,
    alertSent: true,
    detectedObjects: ['Trap', 'Campfire'],
    status: 'Reviewed',
    timestamp: new Date(Date.now() - 60 * 60000).toISOString(),
    location: { lat: 26.5775, lon: 93.1711, name: 'Kaziranga National Park' },
  },
  {
    id: 'PA-003',
    isSuspicious: false,
    confidence: 45.2,
    alertSent: false,
    detectedObjects: [],
    status: 'False Positive',
    timestamp: new Date(Date.now() - 180 * 60000).toISOString(),
    location: { lat: 23.4700, lon: 80.1500, name: 'Bandhavgarh Tiger Reserve' },
  },
];

export const initialActivityEvents: ActivityEvent[] = [
  {
    id: 'ACT-001',
    type: 'wildlife',
    title: 'Tiger Detected',
    description: 'Bengal tiger spotted in Kanha National Park with 94.5% confidence',
    timestamp: new Date(Date.now() - 30 * 60000).toISOString(),
    severity: 'info',
  },
  {
    id: 'ACT-002',
    type: 'fire',
    title: 'High Fire Risk Alert',
    description: 'Fire risk level elevated to HIGH in Western Ghats region',
    timestamp: new Date(Date.now() - 15 * 60000).toISOString(),
    severity: 'warning',
  },
  {
    id: 'ACT-003',
    type: 'poaching',
    title: 'Suspicious Activity Detected',
    description: 'Potential poaching activity detected near Kaziranga - Alert sent',
    timestamp: new Date(Date.now() - 20 * 60000).toISOString(),
    severity: 'danger',
  },
  {
    id: 'ACT-004',
    type: 'wildlife',
    title: 'Elephant Herd Detected',
    description: 'Group of 5 elephants identified in Kaziranga National Park',
    timestamp: new Date(Date.now() - 45 * 60000).toISOString(),
    severity: 'info',
  },
  {
    id: 'ACT-005',
    type: 'habitat',
    title: 'Habitat Assessment Complete',
    description: 'Western Ghats region assessed as HIGH suitability for Tigers',
    timestamp: new Date(Date.now() - 60 * 60000).toISOString(),
    severity: 'info',
  },
  {
    id: 'ACT-006',
    type: 'fire',
    title: 'Fire Risk Decreased',
    description: 'Rainfall detected in Northeast region - risk level lowered',
    timestamp: new Date(Date.now() - 90 * 60000).toISOString(),
    severity: 'info',
  },
  {
    id: 'ACT-007',
    type: 'wildlife',
    title: 'Deer Group Spotted',
    description: 'Spotted deer herd observed at Bandhavgarh Tiger Reserve',
    timestamp: new Date(Date.now() - 120 * 60000).toISOString(),
    severity: 'info',
  },
  {
    id: 'ACT-008',
    type: 'poaching',
    title: 'Alert Confirmed',
    description: 'Previous suspicious activity confirmed - authorities notified',
    timestamp: new Date(Date.now() - 150 * 60000).toISOString(),
    severity: 'danger',
  },
  {
    id: 'ACT-009',
    type: 'wildlife',
    title: 'Leopard Detected',
    description: 'Indian leopard spotted in Mudumalai National Park',
    timestamp: new Date(Date.now() - 180 * 60000).toISOString(),
    severity: 'info',
  },
  {
    id: 'ACT-010',
    type: 'habitat',
    title: 'New Region Mapped',
    description: 'Central India forests added to habitat monitoring system',
    timestamp: new Date(Date.now() - 240 * 60000).toISOString(),
    severity: 'info',
  },
];
