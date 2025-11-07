import DailyIframe, { DailyCall } from '@daily-co/daily-js';

export interface DailyCallConfig {
  roomUrl: string;
  token: string;
  userName?: string;
}

export const createDailyCallClient = async (config: DailyCallConfig) => {
  const callFrame = DailyIframe.createCallObject({
    audioSource: true,
    videoSource: false,
  });

  try {
    await callFrame.join({
      url: config.roomUrl,
      token: config.token,
      userName: config.userName || 'User',
    });

    console.log('Daily call client joined successfully');
    return callFrame;
  } catch (error) {
    console.error('Failed to join Daily call:', error);
    throw error;
  }
};

export const endDailyCall = async (callFrame: DailyCall) => {
  try {
    await callFrame.leave();
    await callFrame.destroy();
    console.log('Daily call ended successfully');
  } catch (error) {
    console.error('Error ending Daily call:', error);
    throw error;
  }
};
