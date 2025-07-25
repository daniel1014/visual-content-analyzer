# Visual Content Analyzer

An AI-powered platform for automatic image tagging and content description using BLIP (Bootstrapping Language-Image Pre-training) models.

![Visual Content Analyzer](https://img.shields.io/badge/AI-Image%20Analysis-blue) ![FastAPI](https://img.shields.io/badge/FastAPI-0.104.1-green) ![React](https://img.shields.io/badge/React-18.x-blue) ![Python](https://img.shields.io/badge/Python-3.8%2B-yellow) ![License](https://img.shields.io/badge/License-MIT-lightgrey)

## 🌟 Features

- **AI-Powered Image Analysis**: BLIP models for accurate image understanding
- **Automatic Tag Generation**: Top 5 descriptive tags with confidence scores
- **Multiple Format Support**: JPEG, PNG, WebP
- **Drag & Drop Interface**: React frontend for easy uploads
- **Batch & Async Processing**: Analyze multiple images with real-time progress
- **REST API**: Integrate with other applications

## 🏗️ System Design & Scalability

### Core Architecture

- **Backend**: FastAPI (async), BLIP model loaded as a singleton for efficiency
- **Frontend**: React + TailwindCSS, drag-and-drop upload, real-time updates

### Scaling for Production

- **Async Queue for Heavy Tasks**:  
  For high throughput, offload image analysis to a background task queue (e.g., Celery, RQ, or FastAPI + Redis Queue).  
  - API receives upload, enqueues job, returns job ID.
  - Worker processes (can be scaled horizontally) pick up jobs and run BLIP inference.
  - Client polls or subscribes for results.

- **Model Serving Layer**:  
  For large-scale or multi-model deployments:
  - Use a dedicated model server (e.g., TorchServe, Triton Inference Server, or custom FastAPI service) to serve BLIP models.
  - API workers send requests to the model server, which can be scaled independently.
  - Enables GPU utilization and load balancing across multiple model instances.

- **Stateless API**:  
  All state (jobs, results) stored in Redis or a database, allowing API and worker scaling.

- **Docker & Orchestration**:  
  All components (API, workers, model server, frontend, Redis) can be containerized and orchestrated (e.g., with Docker Compose or Kubernetes) for easy scaling and deployment.

## 🚀 Quick Start

### Prerequisites

- Python 3.11.13 and pip
- Node.js 16+ and npm
- Git

### Local Setup