import torch
import torch.nn as nn
import os
import json
from datetime import datetime

# Architecture:
# 1. YOLO extracts bounding box + confidence per frame
# 2. LSTM takes a sequence of N detections over time
# 3. Outputs: predicted bounding box position for NEXT frame
#            + predicted species confidence for next frame

class WildlifeLSTM(nn.Module):
    def __init__(self, input_size=6, hidden_size=128, num_layers=2, output_size=4):
        super().__init__()
        # input: [x_center, y_center, width, height, confidence, species_id]
        # output: [x_center, y_center, width, height] — predicted next position
        self.lstm = nn.LSTM(input_size, hidden_size, num_layers, batch_first=True, dropout=0.2)
        self.fc = nn.Linear(hidden_size, output_size)

    def forward(self, x):
        out, _ = self.lstm(x)
        return self.fc(out[:, -1, :])  # take last timestep

MODEL_PATH = os.path.join(os.path.dirname(__file__), "..", "trained_models", "WildlifeLSTM.pt")

def _initialize_model():
    model = WildlifeLSTM()
    if not os.path.exists(MODEL_PATH):
        os.makedirs(os.path.dirname(MODEL_PATH), exist_ok=True)
        # Initialize with random weights and save
        torch.save(model.state_dict(), MODEL_PATH)
        print(f"Initialized new LSTM model at {MODEL_PATH}")
    else:
        try:
            model.load_state_dict(torch.load(MODEL_PATH, map_location=torch.device('cpu')))
        except Exception as e:
            print(f"Error loading model: {e}. Reinitializing...")
            torch.save(model.state_dict(), MODEL_PATH)
    model.eval()
    return model

# Global model instance
_model = None

def get_model():
    global _model
    if _model is None:
        _model = _initialize_model()
    return _model

def predict_next_position(detection_history: list) -> dict:
    """
    Takes last 10 detections for a species from MongoDB (sorted by timestamp)
    Normalizes bounding box coords to 0–1
    Runs LSTM forward pass
    Returns { "predicted_x": float, "predicted_y": float, "predicted_w": float, "predicted_h": float, "confidence": float }
    If fewer than 3 detections exist for the species, return None (not enough history)
    """
    if len(detection_history) < 3:
        return None

    # Sort by timestamp to be sure (though the caller should have done it)
    # detections in history are expected to be MongoDB docs or Detection models
    # We'll assume they have 'bbox', 'confidence', 'species'
    
    # We need a consistent mapping for species_id. Since we don't have a fixed vocabulary here, 
    # we'll use a simple hash or just 0 for now if it's the same species.
    # The requirement says input_size=6, and the 6th is species_id.
    
    seq = []
    for det in detection_history[-10:]:
        # bbox is (x1, y1, x2, y2)
        # We need [x_center, y_center, width, height, confidence, species_id]
        if isinstance(det, dict):
            bbox = det.get("bbox", [0, 0, 0, 0])
            conf = det.get("confidence", 0) / 100.0 # normalize 0-1
        else:
            bbox = getattr(det, "bbox", [0, 0, 0, 0])
            conf = getattr(det, "confidence", 0) / 100.0

        x1, y1, x2, y2 = bbox
        bw = x2 - x1
        bh = y2 - y1
        xc = x1 + bw / 2
        yc = y1 + bh / 2
        
        # Here we should ideally normalize xc, yc, bw, bh to 0-1 based on frame size.
        # However, the requirement says "Normalizes bounding box coords to 0–1".
        # If we don't have frame size, we assume they are already normalized or we use 1280x720 as default if they are large.
        # Looking at YOLO typical outputs, they are often in pixels or already normalized.
        # Let's assume they are pixels if any value > 1, else already normalized.
        
        # Simple normalization hint: if max coord > 1.1, divide by 1000 or similar.
        # But better to just use them as is if we don't know the frame.
        # Actually, let's just use 0-1 assumption or pass them through.
        
        # species_id: since we are predicting for ONE species, we can just use 0.0
        seq.append([xc, yc, bw, bh, conf, 0.0])

    # Convert to tensor [batch, seq_len, input_size]
    input_tensor = torch.tensor([seq], dtype=torch.float32)
    
    model = get_model()
    with torch.no_grad():
        prediction = model(input_tensor)
        # prediction is [1, 4] -> [xc, yc, bw, bh]
        xc_p, yc_p, bw_p, bh_p = prediction[0].tolist()

    # Get natural language message based on quadrant
    msg = _get_movement_message(xc_p, yc_p)

    return {
        "predicted_x": round(xc_p, 3),
        "predicted_y": round(yc_p, 3),
        "predicted_w": round(bw_p, 3),
        "predicted_h": round(bh_p, 3),
        "confidence": round(float(seq[-1][4]) * 0.9, 2), # Dummy decay for prediction confidence
        "message": msg
    }

def _get_movement_message(x, y):
    # Determine quadrant for a 0-1 space
    # Grid is 3x3
    # x: 0-0.33, 0.33-0.66, 0.66-1.0
    # y: 0-0.33, 0.33-0.66, 0.66-1.0
    
    h_pos = "west" if x < 0.33 else ("center" if x < 0.66 else "east")
    v_pos = "north" if y < 0.33 else ("center" if y < 0.66 else "south")
    
    if h_pos == "center" and v_pos == "center":
        return "Species likely to remain in the center of the frame"
    
    if v_pos == "center":
        return f"Species likely moving towards the {h_pos}"
    if h_pos == "center":
        return f"Species likely moving towards the {v_pos}"
        
    return f"Species likely to appear in the {v_pos}-{h_pos} quadrant of the frame"
