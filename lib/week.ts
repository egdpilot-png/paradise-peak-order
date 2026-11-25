// The weekly rhythm, one line per day. Single source for the guest pages,
// the emails and the printed QR card so the wording never drifts apart.

export interface WeekLine { day: string; day_fr: string; text: string; text_fr: string }

export const WEEK_LINES: WeekLine[] = [
  { day: 'Monday', day_fr: 'Lundi', text: 'Caribbean buffet, €55 per person', text_fr: 'Buffet caribéen, 55 € par personne' },
  { day: 'Tuesday', day_fr: 'Mardi', text: 'Menu of the day, served plated, priced per dish', text_fr: 'Menu du jour servi à l\u2019assiette, prix par plat' },
  { day: 'Wednesday', day_fr: 'Mercredi', text: 'Menu of the day, served plated, priced per dish', text_fr: 'Menu du jour servi à l\u2019assiette, prix par plat' },
  { day: 'Thursday', day_fr: 'Jeudi', text: 'Menu of the day, served plated, priced per dish', text_fr: 'Menu du jour servi à l\u2019assiette, prix par plat' },
  { day: 'Friday', day_fr: 'Vendredi', text: 'Caribbean buffet, €55 per person', text_fr: 'Buffet caribéen, 55 € par personne' },
  { day: 'Saturday', day_fr: 'Samedi', text: 'Pizza night, priced per pizza', text_fr: 'Soirée pizza, prix par pizza' },
  { day: 'Sunday', day_fr: 'Dimanche', text: 'No service', text_fr: 'Pas de service' },
];

export const WEEK_FOOT = {
  en: 'Dinner from 19:00. Change or cancel free of charge until 10:00 on the day.',
  fr: 'Dîner à partir de 19 h. Modification ou annulation gratuite jusqu\u2019à 10 h le jour même.',
};
