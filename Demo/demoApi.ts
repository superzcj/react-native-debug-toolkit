import { Platform } from 'react-native';

// For a physical device, replace this host with your computer's LAN IP.
export const DEMO_HOST = Platform.OS === 'android' ? '10.0.2.2' : 'localhost';
export const DEMO_API = `http://${DEMO_HOST}:3801`;

// Explicit text XHR keeps the JSON body inspectable across RN fetch/Blob versions.
export function checkoutRequest(scenario: 'sold-out' | 'available') {
  return new Promise<{ status: number; ok: boolean; data: { message?: string; orderId?: string } }>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${DEMO_API}/checkout`);
    xhr.timeout = 8000;
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.setRequestHeader('X-Demo-Scenario', scenario);
    xhr.onload = () => {
      try {
        resolve({ status: xhr.status, ok: xhr.status >= 200 && xhr.status < 300, data: JSON.parse(xhr.responseText) });
      } catch (error) { reject(error); }
    };
    xhr.onerror = () => reject(new Error('Demo API unreachable'));
    xhr.ontimeout = () => reject(new Error('Demo API timed out'));
    xhr.send(JSON.stringify({ scenario, productId: 'linen-chair', quantity: 1, currency: 'CNY' }));
  });
}
