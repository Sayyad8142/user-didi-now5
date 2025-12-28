export interface PushService {
  isSupported(): boolean;
  requestPermission(): Promise<boolean>;
  registerToken(token: string, userId: string): Promise<void>;
  onMessage(handler: (payload: any) => void): () => void;
}
