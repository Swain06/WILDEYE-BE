export interface Detection {
  id: string;
  species: string;
  confidence: number;
  bbox: [number, number, number, number];
  timestamp: string;
  location: { lat: number; lon: number; name: string };
  imageUrl?: string;
  enhancedImageUrl?: string;
}

export interface WildlifeDetectionResult {
  detections: Detection[];
  timestamp: string;
  location: { lat: number; lon: number; name: string };
  enhancedImageUrl?: string;
}

export interface HabitatPrediction {
  suitability: 'High' | 'Medium' | 'Low';
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

export interface FirePrediction {
  riskLevel: 'Low' | 'Medium' | 'High' | 'Critical';
  probability: number;
  forecast: { day: number; probability: number }[];
  recommendations: string;
  location: { lat: number; lon: number; name: string };
}

export interface FireHotspot {
  id: string;
  location: { lat: number; lon: number; name: string };
  riskLevel: 'Low' | 'Medium' | 'High' | 'Critical';
  probability: number;
  timestamp: string;
}

export interface PoachingAlert {
  id: string;
  isSuspicious: boolean;
  confidence: number;
  alertSent: boolean;
  detectedObjects: string[];
  status: 'Pending' | 'Reviewed' | 'Confirmed' | 'False Positive';
  timestamp: string;
  location: { lat: number; lon: number; name: string };
  imageUrl?: string;
}

export interface AlertConfig {
  emailRecipients: string;
  smsRecipients: string;
  confidenceThreshold: number;
}

export interface ActivityEvent {
  id: string;
  type: 'wildlife' | 'fire' | 'poaching' | 'habitat';
  title: string;
  description: string;
  timestamp: string;
  severity?: 'info' | 'warning' | 'danger';
}

export interface Stats {
  wildlifeDetections: number;
  activeFireAlerts: number;
  poachingAlerts: number;
  habitatRegions: number;
}
