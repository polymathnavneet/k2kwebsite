export type RouteStop = {
  name: string;
  state: string;
  lat: number;
  lon: number;
  km: number;
  note: string;
};

export type WalkRoute = {
  title: string;
  startDate: string;
  paceKmPerDay: number;
  totalDistance: number;
  updatedAt?: string | null;
  stops: RouteStop[];
};

export type Journey = {
  mode: "preparation" | "live";
  status: string;
  day: number;
  distanceToday: number;
  distanceTotal: number;
  routeProgressKm?: number;
  offRouteKm?: number;
  stepsToday: number;
  walkingMinutes: number;
  currentPlace: string;
  lat: number;
  lon: number;
  temperature: number | null;
  altitude: number | null;
  battery: number | null;
  connectivity: string;
  lastSleep: string;
  latestTitle: string;
  latestText: string;
  latestUrl: string;
  sponsorName: string;
  updatedAt?: string | null;
};

export type PublicMessage = {
  id: string;
  type: string;
  name: string;
  place: string;
  message: string;
  status: string;
  reply: string;
  followUp: string;
  followUpReply: string;
  createdAt: string;
  repliedAt?: string | null;
  followUpAt?: string | null;
  followUpRepliedAt?: string | null;
  canFollowUp?: boolean;
  contact?: string;
};

export type RouteSuggestion = {
  id: string;
  kind: string;
  name: string;
  state: string;
  lat: number;
  lon: number;
  km: number;
  reason: string;
  status: string;
  createdAt: string;
  decidedAt?: string | null;
};

export type MediaItem = {
  id: string;
  kind: "instagram" | "youtube" | "image" | string;
  url: string;
  caption: string;
  place: string;
  sortOrder: number;
  createdAt: string;
};

export type JournalEntry = {
  id: string;
  day: string;
  question: string;
  body: string;
  place: string;
  phase: string;
  published: number;
  createdAt: string;
};
