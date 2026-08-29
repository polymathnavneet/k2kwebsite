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
  createdAt: string;
  repliedAt?: string | null;
  contact?: string;
};
