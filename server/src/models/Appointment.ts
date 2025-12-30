import mongoose from 'mongoose';

const appointmentSchema = new mongoose.Schema({
    name: { type: String },
    phone: { type: String },
    address: { type: String },
    scheduled_date: { type: String },
    scheduled_time: { type: String },
    sector: { type: String },
    district: { type: String },
    city: { type: String },
    user_name: { type: String },
    user_id: { type: String },
    conversation_id: { type: String },
    listing_title: { type: String },
    pool_type: { type: String },
    status: { type: String, default: 'confirmed' },
    extracted_at: { type: Date },
    created_at: { type: Date, default: Date.now },
    updated_at: { type: Date, default: Date.now }
}, {
    timestamps: true
});

export default mongoose.model('Appointment', appointmentSchema);





