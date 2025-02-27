export interface Client {
    id?: string;
    nom: string;
    adresse: string;
    telephone: string;
    email: string;
    date_preferee: string;
  }
  
  export interface CalendarEvent {
    id: string;
    title: string;
    start: Date;
    end: Date;
    clientId?: string;
  }