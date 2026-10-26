'use client';

import { useEffect, useId, useSyncExternalStore } from 'react';

type Appearance = 'light' | 'dark' | 'system';
const storageKey = 'houseworthit-appearance';
const changeEvent = 'houseworthit-appearance-change';
let temporaryPreference: Appearance | null = null;

function normalize(value: string | null): Appearance {
  return value === 'light' || value === 'dark' ? value : 'system';
}

function preference(): Appearance {
  if (temporaryPreference !== null) return temporaryPreference;
  try {
    return normalize(localStorage.getItem(storageKey));
  } catch {
    return normalize(document.documentElement.dataset.appearance || null);
  }
}

function subscribe(notify: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === storageKey || event.key === null) {
      temporaryPreference = null;
      notify();
    }
  };
  window.addEventListener(changeEvent, notify);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(changeEvent, notify);
    window.removeEventListener('storage', onStorage);
  };
}

function useAppearance() {
  return useSyncExternalStore(subscribe, preference, (): Appearance => 'system');
}

function apply(value: Appearance) {
  const root = document.documentElement;
  root.dataset.appearance = value;
  root.dataset.theme = value === 'system'
    ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    : value;
}

function choose(value: Appearance) {
  try {
    localStorage.setItem(storageKey, value);
    temporaryPreference = null;
  } catch {
    temporaryPreference = value;
  }
  apply(value);
  window.dispatchEvent(new Event(changeEvent));
}

export function AppearanceController() {
  const value = useAppearance();
  useEffect(() => {
    apply(value);
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const update = () => apply(value);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, [value]);
  return null;
}

export function AppearanceSelect() {
  const id = useId();
  const value = useAppearance();
  return (
    <div className="appearance-select">
      <label htmlFor={id}>Appearance</label>
      <select id={id} value={value} onChange={event => choose(normalize(event.target.value))}>
        <option value="light">Light</option>
        <option value="dark">Dark</option>
        <option value="system">System</option>
      </select>
    </div>
  );
}
