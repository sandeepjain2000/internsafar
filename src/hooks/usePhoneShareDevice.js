'use client';

import { useSyncExternalStore } from 'react';
import { isPhoneShareDevice } from '@/lib/ipShareDevice';

const subscribe = () => () => {};

/** true on phones/tablets, false on laptops, null during server render. */
export function usePhoneShareDevice() {
  return useSyncExternalStore(subscribe, isPhoneShareDevice, () => null);
}
