export interface HubApp {
  id: string; slug: string; name: string; tagline: string; description: string; url: string; icon: string; color: string;
  status: "live" | "beta" | "soon" | "hidden"; sort: number;
}
export interface Me { id: string; name: string; email: string; owner: boolean; member: boolean }
