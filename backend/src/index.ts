import dotenv from 'dotenv';
// Load environment variables first
dotenv.config();

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { connectDB } from './config/db';
import verdictRoutes from './routes/verdictRoutes';

const app = express();
const PORT = process.env.PORT || 5000;

// Enable CORS for Chrome Extension support
app.use(cors({
  origin: '*', // Allow all origins for the Chrome Extension (request origins start with chrome-extension://)
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Body parsers
app.use(express.json({ limit: '10mb' })); // Support larger reviews payload
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Health Check Endpoint
app.get('/health', (req: Request, res: Response) => {
  res.status(200).json({ status: 'OK', timestamp: new Date() });
});

// Mount Routes
app.use('/api/v1', verdictRoutes);

// Fallback for undefined routes
app.use((req: Request, res: Response) => {
  res.status(404).json({ error: 'NotFound', message: `Route ${req.method} ${req.path} not found.` });
});

// Global Error Handler Middleware
app.use((err: any, req: Request, res: Response, _next: NextFunction) => {
  console.error('Unhandled Application Error:', err);

  const statusCode = err.status || err.statusCode || 500;
  const message = err.message || 'An unexpected error occurred on the server.';

  res.status(statusCode).json({
    error: err.name || 'InternalServerError',
    message,
    // Avoid leaking stack trace in production-like settings
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });
});

// Boot Server
async function startServer() {
  // Connect to MongoDB Cold Storage
  await connectDB();

  app.listen(PORT, () => {
    console.log(`=================================================`);
    console.log(` Verdict Engine Backend running on port ${PORT}`);
    console.log(` Health: http://localhost:${PORT}/health`);
    console.log(` API Base: http://localhost:${PORT}/api/v1`);
    console.log(` Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`=================================================`);
  });
}

startServer().catch((err) => {
  console.error('Fatal Server Boot Error:', err);
  process.exit(1);
});
