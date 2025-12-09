import mongoose from 'mongoose';

const clientSchema = new mongoose.Schema({
    givenName: { type: String, required: true },
    familyName: { type: String },
    phoneNumber: { type: String },
    addressLine1: { type: String },
    squareId: { type: String, unique: true },
    coordinates: {
        lng: { type: Number },
        lat: { type: Number }
    },
    // Champs géographiques extraits de l'adresse
    city: { type: String },
    district: { type: String },
    sector: { type: String } // Montréal, Laval, Rive Nord, Rive Sud, Autres
}, {
    timestamps: true // Ajoute automatiquement createdAt et updatedAt
});

export default mongoose.model('Client', clientSchema);