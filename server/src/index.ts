import express, { Router } from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';
import squareRoutes from './routes/squareRoutes';
import clientRoutes from './routes/clientRoutes';
import mapboxRoutes from './routes/mapboxRoutes';
import routeOptimizer from './routes/routeOptimizer';
import clientDistrictsRoutes from './routes/clientDistrictsRoutes'
import manualDistrictAssignment from './routes/manualDistrictAssignment';
import webhookRoutes from './routes/webhookRoutes';



dotenv.config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

const SQUARE_ACCESS_TOKEN = process.env.SQUARE_ACCESS_TOKEN || '';






// Routes
app.use('/api/square', squareRoutes);
app.use('/api/clients', clientRoutes);
app.use('/api/mapbox', mapboxRoutes);
app.use('/api/optimize', routeOptimizer);
app.use('/', manualDistrictAssignment);
app.use('/', clientDistrictsRoutes);
app.use('/api', webhookRoutes);





const PORT = process.env.PORT || 3000;

// MongoDB Connection
const startServer = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI!);
    console.log('✅ Connected to MongoDB:', process.env.MONGODB_URI);
    
    app.listen(PORT, () => {
      console.log(`🚀Server is running on port ${PORT}`);
    });

    console.log("Square Token:", SQUARE_ACCESS_TOKEN); // Vérifie que ton token est bien chargé
    
  } catch (error) {
    console.error('❌ Failed to connect to MongoDB:', error);
    process.exit(1);
  }
};

startServer();

console.log("Square Token:", SQUARE_ACCESS_TOKEN); // Vérifie que ton token est bien chargé