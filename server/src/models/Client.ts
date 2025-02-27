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
    }
});

export default mongoose.model('Client', clientSchema);