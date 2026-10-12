export type Product = {
  id: string;
  name: string;
  url: string;
  price: string;
  category: string;
  emoji: string;
};
export type Automation = {
  id: string;
  name: string;
  mediaId: string;
  postUrl: string;
  postLabel: string;
  keywords: string[];
  matchMode: "word" | "exact";
  message: string;
  productIds: string[];
  active: boolean;
  createdAt: string;
};
export type DeliveryStatus =
  | "queued"
  | "sending"
  | "sent"
  | "failed"
  | "uncertain"
  | "skipped";
export type Delivery = {
  id: string;
  automationId: string;
  automationName: string;
  username: string;
  status: DeliveryStatus;
  message: string;
  error: string | null;
  createdAt: string;
};
export type Account = {
  username: string;
  connected: boolean;
  expiresAt: string | null;
  subscribed: boolean;
};
export type DashboardData = {
  products: Product[];
  automations: Automation[];
  deliveries: Delivery[];
  account: Account;
  daily: { day: string; sent: number }[];
  totals: { sent: number; queued: number; failed: number; uncertain: number };
  config: {
    database: boolean;
    instagram: boolean;
    webhook: boolean;
    appUrl: string;
    demo: boolean;
  };
};
export type CommentEvent = {
  accountId: string;
  commentId: string;
  mediaId: string;
  senderId: string;
  username: string;
  text: string;
  occurredAt: Date;
};
