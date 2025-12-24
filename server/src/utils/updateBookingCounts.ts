// Utilitaire pour compter les rendez-vous depuis Square API et mettre à jour MongoDB
import Client from '../models/Client';
import squareClient from '../config/square';

/**
 * Met à jour le compteur de rendez-vous pour tous les clients
 * Cette fonction compte tous les rendez-vous passés et futurs pour chaque client
 */
export async function updateAllBookingCounts(): Promise<{
  success: boolean;
  updated: number;
  errors: number;
  message: string;
}> {
  try {
    console.log('🔄 Début de la mise à jour des compteurs de rendez-vous...');
    
    // Récupérer tous les clients avec un squareId
    const clients = await Client.find({ squareId: { $exists: true, $ne: null } });
    console.log(`📊 ${clients.length} clients à traiter`);
    
    let updated = 0;
    let errors = 0;
    
    // Date de début : il y a 2 ans (pour capturer l'historique)
    const startDate = new Date();
    startDate.setFullYear(startDate.getFullYear() - 2);
    
    // Date de fin : dans 1 an (pour capturer les rendez-vous futurs)
    const endDate = new Date();
    endDate.setFullYear(endDate.getFullYear() + 1);
    
    // Récupérer tous les rendez-vous dans cette plage
    console.log(`📅 Récupération des rendez-vous du ${startDate.toISOString()} au ${endDate.toISOString()}`);
    
    const bookingsMap = new Map<string, number>(); // squareId -> count
    
    try {
      // Square API limite à 31 jours par requête, donc on divise en segments
      const segmentDays = 30; // 30 jours pour être sûr
      const totalDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
      const segments = Math.ceil(totalDays / segmentDays);
      
      console.log(`📊 Division en ${segments} segments de ${segmentDays} jours`);
      
      for (let i = 0; i < segments; i++) {
        const segmentStart = new Date(startDate);
        segmentStart.setDate(segmentStart.getDate() + (i * segmentDays));
        
        const segmentEnd = new Date(segmentStart);
        segmentEnd.setDate(segmentEnd.getDate() + segmentDays);
        
        // Ne pas dépasser la date de fin
        if (segmentEnd > endDate) {
          segmentEnd.setTime(endDate.getTime());
        }
        
        console.log(`📅 Segment ${i + 1}/${segments}: ${segmentStart.toISOString()} -> ${segmentEnd.toISOString()}`);
        
        try {
          const bookingsResponse = await squareClient.bookings.list({
            startAtMin: segmentStart.toISOString(),
            startAtMax: segmentEnd.toISOString(),
            locationId: "L24K8X13MB1A7",
            limit: 1000
          });
          
          // Compter les rendez-vous par client
          for await (const booking of bookingsResponse) {
            if (booking.customerId && booking.status && String(booking.status) !== 'CANCELLED') {
              const count = bookingsMap.get(booking.customerId) || 0;
              bookingsMap.set(booking.customerId, count + 1);
            }
          }
          
          // Petit délai entre les segments pour éviter les rate limits
          if (i < segments - 1) {
            await new Promise(resolve => setTimeout(resolve, 500));
          }
        } catch (segmentError) {
          console.error(`❌ Erreur lors de la récupération du segment ${i + 1}:`, segmentError);
          // Continuer avec les autres segments
        }
      }
      
      console.log(`✅ ${bookingsMap.size} clients avec des rendez-vous trouvés`);
    } catch (error) {
      console.error('❌ Erreur lors de la récupération des rendez-vous depuis Square:', error);
      return {
        success: false,
        updated: 0,
        errors: clients.length,
        message: `Erreur lors de la récupération des rendez-vous: ${error instanceof Error ? error.message : 'Erreur inconnue'}`
      };
    }
    
    // Mettre à jour chaque client
    for (const client of clients) {
      try {
        if (!client.squareId) {
          continue;
        }
        
        const bookingCount = bookingsMap.get(client.squareId) || 0;
        const isFrequentClient = bookingCount >= 3;
        
        // Mettre à jour seulement si les valeurs ont changé
        if (client.bookingCount !== bookingCount || client.isFrequentClient !== isFrequentClient) {
          await Client.updateOne(
            { _id: client._id },
            {
              $set: {
                bookingCount: bookingCount,
                isFrequentClient: isFrequentClient
              }
            }
          );
          updated++;
          
          if (updated % 10 === 0) {
            console.log(`⏳ ${updated} clients mis à jour...`);
          }
        }
      } catch (error) {
        console.error(`❌ Erreur lors de la mise à jour du client ${client._id}:`, error);
        errors++;
      }
    }
    
    console.log(`✅ Mise à jour terminée: ${updated} clients mis à jour, ${errors} erreurs`);
    
    return {
      success: true,
      updated,
      errors,
      message: `${updated} clients mis à jour avec succès, ${errors} erreurs`
    };
  } catch (error) {
    console.error('❌ Erreur générale lors de la mise à jour des compteurs:', error);
    return {
      success: false,
      updated: 0,
      errors: 0,
      message: `Erreur: ${error instanceof Error ? error.message : 'Erreur inconnue'}`
    };
  }
}

/**
 * Met à jour le compteur de rendez-vous pour un seul client
 */
export async function updateClientBookingCount(squareId: string): Promise<{
  success: boolean;
  bookingCount: number;
  isFrequentClient: boolean;
}> {
  try {
    // Date de début : il y a 2 ans
    const startDate = new Date();
    startDate.setFullYear(startDate.getFullYear() - 2);
    
    // Date de fin : dans 1 an
    const endDate = new Date();
    endDate.setFullYear(endDate.getFullYear() + 1);
    
    let bookingCount = 0;
    
    try {
      // Square API limite à 31 jours par requête, donc on divise en segments
      const segmentDays = 30; // 30 jours pour être sûr
      const totalDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
      const segments = Math.ceil(totalDays / segmentDays);
      
      for (let i = 0; i < segments; i++) {
        const segmentStart = new Date(startDate);
        segmentStart.setDate(segmentStart.getDate() + (i * segmentDays));
        
        const segmentEnd = new Date(segmentStart);
        segmentEnd.setDate(segmentEnd.getDate() + segmentDays);
        
        // Ne pas dépasser la date de fin
        if (segmentEnd > endDate) {
          segmentEnd.setTime(endDate.getTime());
        }
        
        const bookingsResponse = await squareClient.bookings.list({
          startAtMin: segmentStart.toISOString(),
          startAtMax: segmentEnd.toISOString(),
          locationId: "L24K8X13MB1A7",
          limit: 1000
        });
        
        for await (const booking of bookingsResponse) {
          if (booking.customerId === squareId && booking.status && String(booking.status) !== 'CANCELLED') {
            bookingCount++;
          }
        }
        
        // Petit délai entre les segments pour éviter les rate limits
        if (i < segments - 1) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }
    } catch (error) {
      console.error(`❌ Erreur lors de la récupération des rendez-vous pour ${squareId}:`, error);
      throw error;
    }
    
    const isFrequentClient = bookingCount >= 3;
    
    // Mettre à jour le client dans MongoDB
    await Client.updateOne(
      { squareId: squareId },
      {
        $set: {
          bookingCount: bookingCount,
          isFrequentClient: isFrequentClient
        }
      }
    );
    
    return {
      success: true,
      bookingCount,
      isFrequentClient
    };
  } catch (error) {
    console.error(`❌ Erreur lors de la mise à jour du compteur pour ${squareId}:`, error);
    throw error;
  }
}

