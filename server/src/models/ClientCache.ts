import mongoose from 'mongoose';

// Schéma pour le cache des clients par ville
const clientByCityCacheSchema = new mongoose.Schema({
  cacheType: { 
    type: String, 
    required: true, 
    enum: ['by-city', 'for-map'],
    unique: true 
  },
  data: { 
    type: mongoose.Schema.Types.Mixed, 
    required: true 
  },
  totalClients: { 
    type: Number, 
    required: true 
  },
  lastUpdate: { 
    type: Date, 
    required: true,
    default: Date.now 
  },
  version: {
    type: Number,
    default: 1
  }
}, {
  timestamps: true
});

// Index pour accélérer les recherches
clientByCityCacheSchema.index({ cacheType: 1 });
clientByCityCacheSchema.index({ lastUpdate: -1 });

export const ClientByCityCache = mongoose.model('ClientByCityCache', clientByCityCacheSchema);

