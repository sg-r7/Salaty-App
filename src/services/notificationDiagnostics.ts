import * as IntentLauncher from "expo-intent-launcher";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import Constants from "expo-constants";
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

export async function getNotificationDiagnostics(): Promise<NotificationDiagnostics> {
  if (Platform.OS !== "android") {
    return {
      notifications: "ready",
      prayerChannel: "ready",
      exactAlarm: "unknown",
      batteryOptimization: "unknown",
    };
  }

  const [{ status }, channel] = await Promise.all([
    Notifications.getPermissionsAsync(),
    Notifications.getNotificationChannelAsync(PRAYER_CHANNEL_ID),
  ]);

  return {
    notifications: status === "granted" ? "ready" : "needs-attention",
    prayerChannel:
      channel?.importance === Notifications.AndroidImportance.MAX &&
      channel.sound !== null
        ? "ready"
        : "needs-attention",
    // Expo SDK 51 does not expose canScheduleExactAlarms() to JavaScript.
    // The settings action below lets the user grant it, then the screen
    // refreshes when the app resumes.
    exactAlarm: "unknown",
    // Battery optimization state is also not exposed by Expo SDK 51.
    batteryOptimization: "unknown",
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
  return openAndroidSettings(EXACT_ALARM_ACTION, packageUri);
}

export async function openBatteryOptimizationSettings(): Promise<boolean> {
  return openAndroidSettings(
    IntentLauncher.ActivityAction.IGNORE_BATTERY_OPTIMIZATION_SETTINGS
  );
}

export async function openAppSettings(): Promise<boolean> {
  return openAndroidSettings(
    IntentLauncher.ActivityAction.APPLICATION_DETAILS_SETTINGS,
    packageUri
  );
}
