import sys
import os
import torch

# Add backend to path
sys.path.append(os.path.join(os.path.dirname(__file__), ".."))

from detection.lstm_predictor import predict_next_position, get_model

def test_model_loading():
    print("Testing model loading...")
    model = get_model()
    assert model is not None
    print("✓ Model loaded successfully")

def test_prediction_not_enough_data():
    print("Testing prediction with not enough data...")
    history = [
        {"bbox": [0, 0, 100, 100], "confidence": 90},
        {"bbox": [10, 10, 110, 110], "confidence": 85}
    ]
    res = predict_next_position(history)
    assert res is None
    print("✓ Correctly returned None for < 3 detections")

def test_prediction_with_data():
    print("Testing prediction with sufficient data...")
    history = [
        {"bbox": [0, 0, 100, 100], "confidence": 90},
        {"bbox": [10, 10, 110, 110], "confidence": 85},
        {"bbox": [20, 20, 120, 120], "confidence": 80}
    ]
    res = predict_next_position(history)
    assert res is not None
    assert "predicted_x" in res
    assert "message" in res
    print(f"✓ Prediction result: {res}")

if __name__ == "__main__":
    try:
        test_model_loading()
        test_prediction_not_enough_data()
        test_prediction_with_data()
        print("\nAll backend tests passed!")
    except Exception as e:
        print(f"\nTests failed: {e}")
        sys.exit(1)
