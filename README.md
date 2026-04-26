
---
title: WildEye
emoji: 🦁
colorFrom: green
colorTo: green
sdk: docker
pinned: false
license: mit
short_description: AI-Powered Wildlife Conservation & Risk Prediction Platform
---

# 🦁 WildEye — AI-Powered Wildlife Conservation Platform

WildEye is a full-stack AI platform for wildlife conservation, featuring real-time detection, fire risk prediction, habitat suitability analysis, and satellite fire monitoring.

## Features

- 🐾 **Wildlife Detection** — YOLOv8-powered species identification from uploaded images
- 🔫 **Poaching Detection** — AI surveillance with Telegram/email alerts
- 🔥 **Fire Risk Prediction** — ML-based wildfire probability with 7-day forecast
- 🗺️ **Interactive Map** — Live geo-tagged markers for all detections
- 🛰️ **Satellite Fire Data** — NASA FIRMS real-time hotspot integration
- 🌿 **Habitat Suitability** — RandomForest habitat analysis for multiple species
- 💬 **AI Ranger Chatbot** — Grok-powered conservation assistant
- 📊 **Analytics Dashboard** — Charts and trends across all modules

## Environment Variables

Set the following Space secrets in your HF Space settings:

| Variable | Description |
|---|---|
| `MONGODB_URI` | MongoDB Atlas connection string |
| `CLOUDINARY_CLOUD_NAME` | Cloudinary cloud name |
| `CLOUDINARY_API_KEY` | Cloudinary API key |
| `CLOUDINARY_API_SECRET` | Cloudinary API secret |
| `OPENWEATHER_API_KEY` | OpenWeatherMap API key |
| `GROK_API_KEY` | xAI Grok API key |
| `NEWS_API_KEY` | NewsAPI key |
| `NASA_FIRMS_API_KEY` | NASA FIRMS API key |
| `TELEGRAM_BOT_TOKEN` | Telegram bot token (optional) |
| `TELEGRAM_CHAT_ID` | Telegram chat ID (optional) |
| `SMTP_USER` | Gmail address for alerts (optional) |
| `SMTP_PASSWORD` | Gmail App Password (optional) |
| `ALERT_RECIPIENT` | Email to receive poaching alerts (optional) |
| `ALLOWED_ORIGINS` | Set to `*` for HF Spaces |

## Tech Stack

- **Backend**: FastAPI + MongoDB (Motor) + PyTorch + Ultralytics YOLOv8
- **Frontend**: React + Vite + TypeScript + TailwindCSS + shadcn/ui
- **Deployment**: Docker (Hugging Face Spaces)
>>>>>>> master
