import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

// Android permanently caches channel settings by ID. This new ID forces the
// OS to create a fresh prayer channel with the bundled Azan sound.
export const PRAYER_CHANNEL_ID = "salaty-prayer-adhan-v8";
export const ATHKAR_CHANNEL_ID = "salaty-athkar-notifications-v2";
export const FRIDAY_CHANNEL_ID = "salaty-friday-notifications-v2";
// Android resolves notification sounds by the raw resource name, without the
// extension. iOS uses the bundled filename.
export const PRAYER_SOUND = Platform.OS === "android" ? "azan" : "azan.mp3";
const LEGACY_PRAYER_CHANNEL_IDS = new Set([
  "salaty-prayer-adhan-v7",
  "salaty-prayer-adhan-v6",
  "salaty-prayer-adhan-v5",
  "prayer_notifications",
  "prayer-adhan-v3-2026",
]);
const STORAGE_KEY_SETTINGS = "salaty_notification_settings";

export interface NotificationSettings {
  prayerNotifications: boolean;
  athkarNotifications: boolean;
  fridayReminder: boolean;
}

export interface PrayerScheduleItem {
  id: string;
  name: string;
  date: Date;
}

if (typeof Notifications.setNotificationHandler === "function") {
  try {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });
  } catch (error) {
    console.warn("Notification handler setup unavailable:", error);
  }
}

export async function configurePrayerNotificationChannel(): Promise<void> {
  if (Platform.OS !== "android") {
    return;
  }

  await Notifications.setNotificationChannelAsync(PRAYER_CHANNEL_ID, {
    name: "أذان ومواقيت الصلاة",
    description: "تنبيهات مواقيت الصلاة بصوت الأذان",
    importance: Notifications.AndroidImportance.MAX,
    sound: PRAYER_SOUND,
    vibrationPattern: [0, 500, 250, 500],
    enableVibrate: true,
    lightColor: "#72efdd",
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    bypassDnd: true,
    audioAttributes: {
      usage: Notifications.AndroidAudioUsage.NOTIFICATION,
      contentType: Notifications.AndroidAudioContentType.SONIFICATION,
    },
  });
}

export async function configureNotificationChannels(): Promise<void> {
  if (Platform.OS !== "android") {
    return;
  }

  await Promise.all([
    configurePrayerNotificationChannel(),
    Notifications.setNotificationChannelAsync(ATHKAR_CHANNEL_ID, {
      name: "تنبيهات الأذكار",
      description: "تذكيرات الأذكار اليومية",
      importance: Notifications.AndroidImportance.DEFAULT,
      sound: "default",
      vibrationPattern: [0, 150, 150],
      enableVibrate: true,
      lightColor: "#72efdd",
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    }),
    Notifications.setNotificationChannelAsync(FRIDAY_CHANNEL_ID, {
      name: "تذكير سورة الكهف",
      description: "تذكير قراءة سورة الكهف يوم الجمعة",
      importance: Notifications.AndroidImportance.DEFAULT,
      sound: "default",
      vibrationPattern: [0, 150, 150],
      enableVibrate: true,
      lightColor: "#72efdd",
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    }),
  ]);
}

export async function registerForNotifications(): Promise<boolean> {
  await configureNotificationChannels();

  const { status: existingStatus } =
    await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  return finalStatus === "granted";
}

const DEFAULT_SETTINGS: NotificationSettings = {
  prayerNotifications: true,
  athkarNotifications: true,
  fridayReminder: true,
};

export async function getNotificationSettings(): Promise<NotificationSettings> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY_SETTINGS);
    if (raw) {
      return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
    }
  } catch {
    // Return safe defaults when storage is unavailable or malformed.
  }

  return DEFAULT_SETTINGS;
}

export async function saveNotificationSettings(
  settings: NotificationSettings
): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify(settings));
  } catch {
    // Settings persistence is best-effort and must not crash the app.
  }
}

export async function cancelPrayerNotifications(): Promise<void> {
  const scheduled =
    await Notifications.getAllScheduledNotificationsAsync();

  for (const item of scheduled) {
    const data = item.content.data;
    const isPrayer =
      data?.type === "prayer" ||
      typeof data?.prayerName === "string" ||
      typeof data?.prayerId === "string" ||
      item.identifier.startsWith("prayer_") ||
      LEGACY_PRAYER_CHANNEL_IDS.has(
        typeof item.trigger === "object" && item.trigger !== null &&
          "channelId" in item.trigger
          ? String(item.trigger.channelId)
          : ""
      );

    if (isPrayer) {
      await Notifications.cancelScheduledNotificationAsync(item.identifier);
    }
  }
}

export async function cancelAllScheduledNotifications(): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync();
}

let schedulingQueue: Promise<unknown> = Promise.resolve();

export function replaceScheduledPrayerNotifications(
  prayers: PrayerScheduleItem[],
  enabled: boolean
): Promise<string[]> {
  const task = schedulingQueue.then(async () => {
    await cancelPrayerNotifications();

    if (!enabled || prayers.length === 0) {
      return [];
    }

    await configurePrayerNotificationChannel();

    const scheduledIds: string[] = [];
    const now = Date.now();

    for (const prayer of prayers) {
      const time = prayer.date.getTime();
      if (!Number.isFinite(time) || time <= now) {
        continue;
      }

      const id = await Notifications.scheduleNotificationAsync({
        content: {
          title: "حي على الصلاة.. 🕋",
          body: `حان الآن وقت صلاة ${prayer.name}`,
          sound: PRAYER_SOUND,
          priority: Notifications.AndroidNotificationPriority.MAX,
          data: {
            type: "prayer",
            prayerId: prayer.id,
            prayerName: prayer.name,
          },
        },
        trigger: {
          date: prayer.date,
          channelId: PRAYER_CHANNEL_ID,
        },
      });

      if (id) {
        scheduledIds.push(id);
      }
    }

    return scheduledIds;
  });

  schedulingQueue = task.catch(() => {});
  return task;
}

export async function scheduleDailyAthkarNotification(
  hour = 8,
  minute = 0
): Promise<string> {
  await configureNotificationChannels();

  return Notifications.scheduleNotificationAsync({
    content: {
      title: "وردك اليومي",
      body: "حافظ على ذكر الله، وابدأ يومك بالأذكار.",
      sound: "default",
      data: { type: "athkar" },
    },
    trigger: {
      hour,
      minute,
      repeats: true,
      channelId: ATHKAR_CHANNEL_ID,
    },
  });
}

export async function scheduleFridayKahfNotification(): Promise<string> {
  await configureNotificationChannels();

  return Notifications.scheduleNotificationAsync({
    content: {
      title: "تذكير سورة الكهف",
      body: "جمعة مباركة. لا تنس قراءة سورة الكهف.",
      sound: "default",
      data: { type: "friday-kahf" },
    },
    trigger: {
      weekday: 6,
      hour: 9,
      minute: 0,
      repeats: true,
      channelId: FRIDAY_CHANNEL_ID,
    },
  });
}
