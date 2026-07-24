import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { I18nManager } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { serviceName as enServiceName, categoryName as enCategoryName } from '../data/services';
import { CUSTOMER_STEPS } from '../lib/requests';
import {
  UI, SERVICE_NAMES, CATEGORY_NAMES, STATUS_LABELS, STEP_LABELS, URGENCY_LABELS,
} from './translations';

I18nManager.allowRTL(true); // permit RTL; forceRTL is applied on language change

const STORAGE_KEY = 'appLang';
const I18nContext = createContext(null);

export function I18nProvider({ children }) {
  const [lang, setLangState] = useState('en');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const saved = await AsyncStorage.getItem(STORAGE_KEY);
        if (saved === 'ar' || saved === 'en') setLangState(saved);
      } catch (e) { /* ignore */ }
      setReady(true);
    })();
  }, []);

  const t = useCallback(
    (key, vars) => {
      let s = (UI[lang] && UI[lang][key]) || UI.en[key] || key;
      if (vars) Object.keys(vars).forEach((k) => { s = s.replace('{' + k + '}', vars[k]); });
      return s;
    },
    [lang]
  );

  const tService = useCallback(
    (id) => (lang === 'ar' && SERVICE_NAMES.ar[id]) || enServiceName(id),
    [lang]
  );
  const tCategory = useCallback(
    (id) => (lang === 'ar' && CATEGORY_NAMES.ar[id]) || enCategoryName(id),
    [lang]
  );
  const tStatus = useCallback(
    (s) => (lang === 'ar' && STATUS_LABELS.ar[s]) || s || 'New',
    [lang]
  );
  const tStep = useCallback(
    (i) => (lang === 'ar' ? STEP_LABELS.ar[i] : CUSTOMER_STEPS[i]) || CUSTOMER_STEPS[i],
    [lang]
  );
  const tUrgency = useCallback(
    (u) => (lang === 'ar' && URGENCY_LABELS.ar[u]) || u,
    [lang]
  );

  // Returns { needsRestart } — RTL flip only fully applies after an app restart.
  const setLang = useCallback(async (next) => {
    try { await AsyncStorage.setItem(STORAGE_KEY, next); } catch (e) { /* ignore */ }
    setLangState(next);
    const shouldRTL = next === 'ar';
    if (I18nManager.isRTL !== shouldRTL) {
      I18nManager.forceRTL(shouldRTL);
      return { needsRestart: true };
    }
    return { needsRestart: false };
  }, []);

  const value = {
    lang,
    isRTL: lang === 'ar',
    ready,
    t, tService, tCategory, tStatus, tStep, tUrgency,
    setLang,
  };

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export const useI18n = () => useContext(I18nContext);
