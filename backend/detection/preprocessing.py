import cv2
import numpy as np
import os

def preprocess_thermal(image_path: str, output_path: str) -> str:
    """
    Convert thermal/IR/low-light images to a format YOLO can process better.
    Steps:
    1. Convert to grayscale
    2. Apply CLAHE (Contrast Limited Adaptive Histogram Equalization)
    3. Apply false-color mapping (COLORMAP_INFERNO for thermal feel)
    4. Denoise
    """
    img = cv2.imread(image_path)
    if img is None:
        raise ValueError(f"Could not read image at {image_path}")
    
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8, 8))
    enhanced = clahe.apply(gray)
    colored = cv2.applyColorMap(enhanced, cv2.COLORMAP_INFERNO)
    denoised = cv2.fastNlMeansDenoisingColored(colored, None, 10, 10, 7, 21)
    cv2.imwrite(output_path, denoised)
    return output_path

def preprocess_nightvision(image_path: str, output_path: str) -> str:
    """
    Enhance low-light/night images before detection.
    Uses gamma correction + CLAHE.
    """
    img = cv2.imread(image_path)
    if img is None:
        raise ValueError(f"Could not read image at {image_path}")
        
    gamma = 2.2
    table = np.array([(i / 255.0) ** (1.0 / gamma) * 255 for i in range(256)]).astype("uint8")
    brightened = cv2.LUT(img, table)
    lab = cv2.cvtColor(brightened, cv2.COLOR_BGR2LAB)
    l, a, b = cv2.split(lab)
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    l = clahe.apply(l)
    enhanced = cv2.merge((l, a, b))
    result = cv2.cvtColor(enhanced, cv2.COLOR_LAB2BGR)
    cv2.imwrite(output_path, result)
    return output_path
