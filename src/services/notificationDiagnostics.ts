import * as IntentLauncher from "expo-intent-launcher";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import Constants from "expo-constants";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { PRAYER_CHANNEL_ID } from "./notificationService";

export type DiagnosticStatus = "ready" | "needs-attention" | "unknown";

export interface NotificationDiagnostics {
  notifications: DiagnosticStatus;
  prayerChannel: DiagnosticStatus;
  exactAlarm: DiagnosticStatus;
  batteryOptimization: DiagnosticStatus;
}

const EXACT_ALARM_ACTION = "android.settings.REQUEST_SCHEDULE_EXACT_ALARM";
const packageName =
  Constants.expoConfig?.android?.package ?? "com.salaty.app";
const packageUri = `package:${packageName}`;
const EXACT_ALARM_REVIEWED_KEY = "salaty_exact_alarm_reviewed";
const BATTERY_OPTIMIZATION_REVIEWED_KEY =
  "salaty_battery_optimization_reviewed";

async function wasReviewed(key: string): Promise<boolean> {
  return (await AsyncStorage.getItem(key)) === "true";
}

async function markReviewed(key: string): Promise<void> {
  await AsyncStorage.setItem(key, "true");
}

export async function getNotificationDiagnostics(): Promise<NotificationDiagnostics> {
  if (Platform.OS !== "android") {
    return {
      notifications: "ready",
      prayerChannel: "ready",
      exactAlarm: "ready",
      batteryOptimization: "ready",
    };
  }

  const [
    { status },
    channel,
    exactAlarmReviewed,
    batteryOptimizationReviewed,
  ] = await Promise.all([
    Notifications.getPermissionsAsync(),
    Notifications.getNotificationChannelAsync(PRAYER_CHANNEL_ID),
    wasReviewed(EXACT_ALARM_REVIEWED_KEY),
    wasReviewed(BATTERY_OPTIMIZATION_REVIEWED_KEY),
  ]);

  const androidVersion =
    typeof Platform.Version === "number" ? Platform.Version : 0;
  const exactAlarm =
    androidVersion < 31 || exactAlarmReviewed ? "ready" : "unknown";
  const batteryOptimization =
    androidVersion < 23 || batteryOptimizationReviewed ? "ready" : "unknown";

  return {
    notifications: status === "granted" ? "ready" : "needs-attention",
    prayerChannel:
      channel?.importance === Notifications.AndroidImportance.MAX &&
      channel.sound !== null
        ? "ready"
        : "needs-attention",
    // Android < 12 has no exact-alarm user setting. On newer Android versions
    // the marker is set only after the user returns from the system settings.
    exactAlarm,
    // Expo SDK 51 does not expose isIgnoringBatteryOptimizations(). Until a
    // native bridge is available, unknown is safer than claiming success.
    batteryOptimization,
  };
}

async function openAndroidSettings(
  action: IntentLauncher.ActivityAction | string,
  data?: string
): Promise<boolean> {
  if (Platform.OS !== "android") {
    return false;
  }

  try {
    await IntentLauncher.startActivityAsync(action, data ? { data } : undefined);
    return true;
  } catch (error) {
    console.warn("Unable to open Android settings:", action, error);
    return false;
  }
}

export async function openExactAlarmSettings(): Promise<boolean> {
  const opened = await openAndroidSettings(EXACT_ALARM_ACTION, packageUri);
  if (opened) {
    await markReviewed(EXACT_ALARM_REVIEWED_KEY);
  }
  return opened;
}

export async function openBatteryOptimizationSettings(): Promise<boolean> {
  const opened = await openAndroidSettings(
    IntentLauncher.ActivityAction.IGNORE_BATTERY_OPTIMIZATION_SETTINGS
  );
  if (opened) {
    await markReviewed(BATTERY_OPTIMIZATION_REVIEWED_KEY);
  }
  return opened;
}

export async function openAppSettings(): Promise<boolean> {
  return openAndroidSettings(
    IntentLauncher.ActivityAction.APPLICATION_DETAILS_SETTINGS,
    packageUri
  );
}
