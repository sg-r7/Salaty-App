import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { AppState } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  CalculationMethod,
  Coordinates,
  Madhab,
  PrayerTimes,
} from "adhan";
import {
  AppCoordinates,
  DEFAULT_LOCATION,
  SavedLocation,
  getSavedLocation,
} from "../services/locationService";
import {
  NotificationSettings,
  cancelAllScheduledNotifications,
  getNotificationSettings,
  registerForNotifications,
  saveNotificationSettings,
  replaceScheduledPrayerNotifications,
} from "../services/notificationService";

export type CalculationMethodName =
  | "muslimWorldLeague"
  | "ummAlQura"
  | "egyptian"
  | "karachi";

export type AsrMadhab = "standard" | "hanafi";

export interface PrayerTimeItem {
  id: string;
  name: string;
  date: Date;
  formattedTime: string;
}

export interface PrayerContextValue {
  prayerTimes: PrayerTimeItem[];
  location: SavedLocation;
  calculationMethod: CalculationMethodName;
  asrMadhab: AsrMadhab;
  hijriDateOffset: number;
  periodMode: boolean;
  notificationSettings: NotificationSettings;
  completedPrayers: Record<string, boolean>;
  completedPrayerCount: number;
  togglePrayerCompletion: (prayerId: string) => Promise<void>;
  loading: boolean;
  error: string | null;
  nextPrayer: PrayerTimeItem | null;
  refreshPrayerData: () => Promise<void>;
  setLocation: (location: SavedLocation) => Promise<void>;
  setCalculationMethod: (
    method: CalculationMethodName
  ) => Promise<void>;
  setAsrMadhab: (madhab: AsrMadhab) => Promise<void>;
  setHijriDateOffset: (offset: number) => Promise<void>;
  setPeriodMode: (enabled: boolean) => Promise<void>;
  updateNotificationSettings: (
    settings: NotificationSettings
  ) => Promise<void>;
  rescheduleNotifications: () => Promise<void>;
}

interface PrayerProviderProps {
  children: React.ReactNode;
}

interface StoredPrayerSettings {
  calculationMethod: CalculationMethodName;
  asrMadhab: AsrMadhab;
  hijriDateOffset: number;
  periodMode: boolean;
}

const SETTINGS_STORAGE_KEY = "salaty_prayer_settings";
const COMPLETED_PRAYERS_KEY_PREFIX = "prayer_completed_";

const DEFAULT_PRAYER_SETTINGS: StoredPrayerSettings = {
  calculationMethod: "ummAlQura",
  asrMadhab: "standard",
  hijriDateOffset: 0,
  periodMode: false,
};

const PRAYER_DEFINITIONS = [
  {
    id: "fajr",
    name: "الفجر",
    key: "fajr",
  },
  {
    id: "sunrise",
    name: "الشروق",
    key: "sunrise",
  },
  {
    id: "dhuhr",
    name: "الظهر",
    key: "dhuhr",
  },
  {
    id: "asr",
    name: "العصر",
    key: "asr",
  },
  {
    id: "maghrib",
    name: "المغرب",
    key: "maghrib",
  },
  {
    id: "isha",
    name: "العشاء",
    key: "isha",
  },
] as const;

const SUPPORTED_HIJRI_OFFSETS = [-2, -1, 0, 1, 2];

function isCalculationMethodName(
  value: unknown
): value is CalculationMethodName {
  return (
    value === "muslimWorldLeague" ||
    value === "ummAlQura" ||
    value === "egyptian" ||
    value === "karachi"
  );
}

function isAsrMadhab(value: unknown): value is AsrMadhab {
  return value === "standard" || value === "hanafi";
}

function isValidHijriOffset(value: unknown): value is number {
  return (
    typeof value === "number" &&
    SUPPORTED_HIJRI_OFFSETS.includes(value)
  );
}

function formatPrayerTime(date: Date): string {
  return date.toLocaleTimeString("ar-SA", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function createCalculationParameters(
  method: CalculationMethodName,
  madhab: AsrMadhab
) {
  let parameters;

  if (method === "muslimWorldLeague") {
    parameters = CalculationMethod.MuslimWorldLeague();
  } else if (method === "ummAlQura") {
    parameters = CalculationMethod.UmmAlQura();
  } else if (method === "egyptian") {
    parameters = CalculationMethod.Egyptian();
  } else {
    parameters = CalculationMethod.Karachi();
  }

  parameters.madhab =
    madhab === "hanafi" ? Madhab.Hanafi : Madhab.Shafi;

  return parameters;
}

function calculatePrayerTimes(
  location: AppCoordinates,
  method: CalculationMethodName,
  madhab: AsrMadhab,
  date: Date
): PrayerTimeItem[] {
  const coordinates = new Coordinates(
    location.latitude,
    location.longitude
  );

  const parameters = createCalculationParameters(
    method,
    madhab
  );

  const calculated = new PrayerTimes(
    coordinates,
    date,
    parameters
  );

  return PRAYER_DEFINITIONS.map((prayer) => {
    const prayerKey = prayer.key as keyof PrayerTimes;
    const value = calculated[prayerKey] as unknown as Date;

    return {
      id: prayer.id,
      name: prayer.name,
      date: value,
      formattedTime: formatPrayerTime(value),
    };
  });
}

function getNextPrayer(
  prayers: PrayerTimeItem[],
  now: Date
): PrayerTimeItem | null {
  const upcomingPrayer = prayers.find(
    (prayer) => prayer.date.getTime() > now.getTime()
  );

  if (upcomingPrayer) {
    return upcomingPrayer;
  }

  return null;
}

function getInitialDate(): Date {
  return new Date();
}

function getLocalDateKey(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export const PrayerContext =
  createContext<PrayerContextValue | undefined>(undefined);

export function PrayerProvider({
  children,
}: PrayerProviderProps) {
  const [location, setLocationState] =
    useState<SavedLocation>(DEFAULT_LOCATION);

  const [calculationMethod, setCalculationMethodState] =
    useState<CalculationMethodName>(
      DEFAULT_PRAYER_SETTINGS.calculationMethod
    );

  const [asrMadhab, setAsrMadhabState] =
    useState<AsrMadhab>(
      DEFAULT_PRAYER_SETTINGS.asrMadhab
    );

  const [hijriDateOffset, setHijriDateOffsetState] =
    useState<number>(
      DEFAULT_PRAYER_SETTINGS.hijriDateOffset
    );

  const [periodMode, setPeriodModeState] = useState<boolean>(
    DEFAULT_PRAYER_SETTINGS.periodMode
  );

  const [notificationSettings, setNotificationSettingsState] =
    useState<NotificationSettings>({
      prayerNotifications: true,
      athkarNotifications: true,
      fridayReminder: true,
    });

  const [completedPrayers, setCompletedPrayers] = useState<
    Record<string, boolean>
  >({});

  const [settingsLoaded, setSettingsLoaded] = useState(false);

  const [prayerTimes, setPrayerTimes] = useState<
    PrayerTimeItem[]
  >([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const persistPrayerSettings = useCallback(
    async (
      nextSettings: StoredPrayerSettings
    ): Promise<void> => {
      await AsyncStorage.setItem(
        SETTINGS_STORAGE_KEY,
        JSON.stringify(nextSettings)
      );
    },
    []
  );

  const loadStoredSettings = useCallback(async (): Promise<void> => {
    const todayKey = `${COMPLETED_PRAYERS_KEY_PREFIX}${getLocalDateKey()}`;
    const [savedLocation, savedSettings, savedNotifications, savedCompleted] =
      await Promise.all([
        getSavedLocation(),
        AsyncStorage.getItem(SETTINGS_STORAGE_KEY),
        getNotificationSettings(),
        AsyncStorage.getItem(todayKey),
      ]);

    setLocationState(savedLocation);

    setNotificationSettingsState(savedNotifications);

    if (savedCompleted) {
      try {
        const parsed = JSON.parse(savedCompleted) as Record<string, unknown>;
        setCompletedPrayers(
          Object.fromEntries(
            Object.entries(parsed).filter(([, value]) => value === true)
          ) as Record<string, boolean>
        );
      } catch {
        setCompletedPrayers({});
      }
    } else {
      setCompletedPrayers({});
    }

    if (!savedSettings) {
      setSettingsLoaded(true);
      return;
    }

    try {
      const parsed = JSON.parse(
        savedSettings
      ) as Partial<StoredPrayerSettings>;

      if (isCalculationMethodName(parsed.calculationMethod)) {
        setCalculationMethodState(parsed.calculationMethod);
      }

      if (isAsrMadhab(parsed.asrMadhab)) {
        setAsrMadhabState(parsed.asrMadhab);
      }

      if (isValidHijriOffset(parsed.hijriDateOffset)) {
        setHijriDateOffsetState(parsed.hijriDateOffset);
      }

      if (typeof parsed.periodMode === "boolean") {
        setPeriodModeState(parsed.periodMode);
      }
    } catch {
      setError("تعذر قراءة إعدادات التطبيق المحفوظة.");
    }

    setSettingsLoaded(true);
  }, []);

  const togglePrayerCompletion = useCallback(
    async (prayerId: string): Promise<void> => {
      const key = `${COMPLETED_PRAYERS_KEY_PREFIX}${getLocalDateKey()}`;
      const nextCompleted = {
        ...completedPrayers,
        [prayerId]: !completedPrayers[prayerId],
      };

      if (!nextCompleted[prayerId]) {
        delete nextCompleted[prayerId];
      }

      setCompletedPrayers(nextCompleted);
      try {
        await AsyncStorage.setItem(key, JSON.stringify(nextCompleted));
      } catch (storageError) {
        console.error("Failed to persist prayer completion:", storageError);
        setError("تعذر حفظ حالة الصلاة الحالية.");
      }
    },
    [completedPrayers]
  );

  const refreshPrayerData = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);

    try {
      const savedLocation = await getSavedLocation();

      const calculatedPrayerTimes = calculatePrayerTimes(
        savedLocation,
        calculationMethod,
        asrMadhab,
        getInitialDate()
      );

      setLocationState(savedLocation);
      setPrayerTimes(calculatedPrayerTimes);
    } catch {
      setError("تعذر حساب مواقيت الصلاة.");
    } finally {
      setLoading(false);
    }
  }, [asrMadhab, calculationMethod]);

  const rescheduleNotifications =
    useCallback(async (): Promise<void> => {
      try {
        if (periodMode) {
          await cancelAllScheduledNotifications();
          console.info(
            "تم تجاوز جدولة إشعارات الصلاة لأن وضع الدورة مفعّل."
          );

          return;
        }

        if (!notificationSettings.prayerNotifications) {
          await replaceScheduledPrayerNotifications([], false);
          console.info(
            "تم تجاوز جدولة إشعارات الصلاة لأنها معطّلة من الإعدادات."
          );

          return;
        }

        const granted = await registerForNotifications();

        if (!granted) {
          const permissionError =
            "لم يتم منح إذن الإشعارات، لذلك لم تتم جدولة إشعارات الصلاة.";

          console.error(permissionError);
          setError(permissionError);

          return;
        }

        const now = Date.now();
        const tomorrow = new Date();
        tomorrow.setHours(12, 0, 0, 0);
        tomorrow.setDate(tomorrow.getDate() + 1);
        const tomorrowPrayerTimes = calculatePrayerTimes(
          location,
          calculationMethod,
          asrMadhab,
          tomorrow
        );

        const upcomingPrayerItems = [...prayerTimes, ...tomorrowPrayerTimes]
          .filter(
            (prayer) =>
              prayer.id !== "sunrise" &&
              prayer.date instanceof Date &&
              Number.isFinite(prayer.date.getTime()) &&
              prayer.date.getTime() > now
          )
          .map((prayer) => ({
            id: `${prayer.id}-${getLocalDateKey(prayer.date)}`,
            name: prayer.name,
            date: prayer.date,
          }));

        const scheduledIdentifiers = await replaceScheduledPrayerNotifications(
          upcomingPrayerItems,
          true
        );

        console.info(
          `تمت جدولة ${scheduledIdentifiers.length} من أصل ${upcomingPrayerItems.length} إشعارات للصلاة.`,
          {
            identifiers: scheduledIdentifiers,
            prayers: upcomingPrayerItems.map((prayer) => ({
              id: prayer.id,
              name: prayer.name,
              date: prayer.date.toISOString(),
            })),
          }
        );

        if (
          upcomingPrayerItems.length > 0 &&
          scheduledIdentifiers.length === 0
        ) {
          const schedulingError =
            "تعذر جدولة إشعارات الصلاة القادمة؛ لم يُنشأ أي إشعار.";

          console.error(schedulingError);
          setError(schedulingError);

          return;
        }

        setError((previousError) =>
          previousError?.startsWith("تعذر جدولة إشعارات الصلاة") ||
          previousError?.startsWith("لم يتم منح إذن الإشعارات")
            ? null
            : previousError
        );
      } catch (scheduleErr) {
        const errorMessage =
          scheduleErr instanceof Error
            ? scheduleErr.message
            : String(scheduleErr);

        const schedulingError = `فشل جدولة إشعارات الصلاة: ${errorMessage}`;

        console.error(schedulingError, scheduleErr);
        setError(schedulingError);
      }
    }, [
      notificationSettings.prayerNotifications,
      periodMode,
      prayerTimes,
      location,
      calculationMethod,
      asrMadhab,
    ]);

  useEffect(() => {
    loadStoredSettings().catch(() => {
      setSettingsLoaded(true);
      setError("تعذر تحميل إعدادات التطبيق.");
    });
  }, [loadStoredSettings]);

  useEffect(() => {
    refreshPrayerData().catch(() => {
      setError("تعذر تحديث مواقيت الصلاة.");
    });
  }, [refreshPrayerData]);

  useEffect(() => {
    if (!settingsLoaded || prayerTimes.length === 0) {
      return;
    }

    rescheduleNotifications().catch((err) => {
      const errorMessage =
        err instanceof Error ? err.message : String(err);

      const schedulingError = `فشل تشغيل جدولة الإشعارات التلقائية: ${errorMessage}`;

      console.error(schedulingError, err);
      setError(schedulingError);
    });
  }, [prayerTimes, rescheduleNotifications, settingsLoaded]);

  useEffect(() => {
    let previousState = AppState.currentState;
    const subscription = AppState.addEventListener("change", (nextState) => {
      const resumed =
        previousState.match(/inactive|background/) &&
        nextState === "active";
      previousState = nextState;

      if (resumed) {
        void refreshPrayerData();
      }
    });

    return () => subscription.remove();
  }, [refreshPrayerData]);

  const setLocation = useCallback(
    async (nextLocation: SavedLocation): Promise<void> => {
      const nextPrayerTimes = calculatePrayerTimes(
        nextLocation,
        calculationMethod,
        asrMadhab,
        getInitialDate()
      );

      const locationStorageModule = await import(
        "../services/locationService"
      );

      await locationStorageModule.saveLocation(nextLocation);

      setLocationState(nextLocation);
      setPrayerTimes(nextPrayerTimes);
    },
    [asrMadhab, calculationMethod]
  );

  const setCalculationMethod = useCallback(
    async (method: CalculationMethodName): Promise<void> => {
      const nextSettings: StoredPrayerSettings = {
        calculationMethod: method,
        asrMadhab,
        hijriDateOffset,
        periodMode,
      };

      await persistPrayerSettings(nextSettings);
      setCalculationMethodState(method);
    },
    [
      asrMadhab,
      hijriDateOffset,
      periodMode,
      persistPrayerSettings,
    ]
  );

  const setAsrMadhab = useCallback(
    async (madhab: AsrMadhab): Promise<void> => {
      const nextSettings: StoredPrayerSettings = {
        calculationMethod,
        asrMadhab: madhab,
        hijriDateOffset,
        periodMode,
      };

      await persistPrayerSettings(nextSettings);
      setAsrMadhabState(madhab);
    },
    [
      calculationMethod,
      hijriDateOffset,
      periodMode,
      persistPrayerSettings,
    ]
  );

  const setHijriDateOffset = useCallback(
    async (offset: number): Promise<void> => {
      if (!isValidHijriOffset(offset)) {
        return;
      }

      const nextSettings: StoredPrayerSettings = {
        calculationMethod,
        asrMadhab,
        hijriDateOffset: offset,
        periodMode,
      };

      await persistPrayerSettings(nextSettings);
      setHijriDateOffsetState(offset);
    },
    [
      asrMadhab,
      calculationMethod,
      periodMode,
      persistPrayerSettings,
    ]
  );

  const setPeriodMode = useCallback(
    async (enabled: boolean): Promise<void> => {
      const nextSettings: StoredPrayerSettings = {
        calculationMethod,
        asrMadhab,
        hijriDateOffset,
        periodMode: enabled,
      };

      await persistPrayerSettings(nextSettings);
      setPeriodModeState(enabled);

      if (enabled) {
        await cancelAllScheduledNotifications();
      }
    },
    [
      asrMadhab,
      calculationMethod,
      hijriDateOffset,
      persistPrayerSettings,
    ]
  );

  const updateNotificationSettings = useCallback(
    async (
      settings: NotificationSettings
    ): Promise<void> => {
      await saveNotificationSettings(settings);
      setNotificationSettingsState(settings);
    },
    []
  );

  const nextPrayer = useMemo(
    () => getNextPrayer(prayerTimes, new Date()),
    [prayerTimes]
  );

  const contextValue = useMemo<PrayerContextValue>(
    () => ({
      prayerTimes,
      location,
      calculationMethod,
      asrMadhab,
      hijriDateOffset,
      periodMode,
      notificationSettings,
      completedPrayers,
      completedPrayerCount: Object.keys(completedPrayers).length,
      togglePrayerCompletion,
      loading,
      error,
      nextPrayer,
      refreshPrayerData,
      setLocation,
      setCalculationMethod,
      setAsrMadhab,
      setHijriDateOffset,
      setPeriodMode,
      updateNotificationSettings,
      rescheduleNotifications,
    }),
    [
      asrMadhab,
      calculationMethod,
      completedPrayers,
      error,
      hijriDateOffset,
      loading,
      location,
      nextPrayer,
      notificationSettings,
      periodMode,
      prayerTimes,
      refreshPrayerData,
      rescheduleNotifications,
      setAsrMadhab,
      setCalculationMethod,
      setHijriDateOffset,
      setLocation,
      setPeriodMode,
      togglePrayerCompletion,
      updateNotificationSettings,
    ]
  );

  return (
    <PrayerContext.Provider value={contextValue}>
      {children}
    </PrayerContext.Provider>
  );
}

export function usePrayer(): PrayerContextValue {
  const context = useContext(PrayerContext);

  if (!context) {
    throw new Error(
      "usePrayer يجب استخدامه داخل PrayerProvider."
    );
  }

  return context;
}

export function getAdjustedGregorianDate(
  date: Date,
  offset: number
): Date {
  const adjustedDate = new Date(date);
  adjustedDate.setDate(adjustedDate.getDate() + offset);

  return adjustedDate;
}
